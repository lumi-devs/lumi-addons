import { container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import {
  MODULE_NAME,
  PROTECTED_KEY,
  RmKeys,
  COUNT_TTL_SECONDS,
} from "./keys.js";

/**
 * Persistence split:
 *  - Protected-role config → Postgres (ModuleData) — durable admin config.
 *  - Mention counters + active blocks + rule id → Redis — ephemeral, fast, daily-rolling.
 * This keeps the addon self-contained (no schema migration) per the addons contract.
 */

export interface ActiveBlock {
  roleId: string;
  roleName: string;
  createdAt: number;
  expiresAt: number;
  durationMinutes: number;
  /** True if an admin added the block manually rather than it triggering from a mention. */
  manual: boolean;
}

// ── Mention counters (Redis, per UTC day) ────────────────────────────────────

export async function incrementMention(
  guildId: string,
  roleId: string,
): Promise<void> {
  const key = RmKeys.count(guildId);
  await container.redis
    .multi()
    .hincrby(key, roleId, 1)
    .expire(key, COUNT_TTL_SECONDS)
    .exec();
}

/**
 * Batched increment for every role mentioned in a single message — one pipelined
 * round-trip instead of N. `HINCRBY` returns the post-increment value, so callers
 * get today's counts back for free and never need a follow-up `getRoleCount`.
 */
export async function incrementMentions(
  guildId: string,
  roleIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (roleIds.length === 0) return counts;

  const key = RmKeys.count(guildId);
  const pipeline = container.redis.multi();
  for (const roleId of roleIds) pipeline.hincrby(key, roleId, 1);
  pipeline.expire(key, COUNT_TTL_SECONDS);
  const replies = await pipeline.exec();

  // Replies are positional: one per queued HINCRBY, in roleIds order, then EXPIRE.
  roleIds.forEach((roleId, i) => {
    const value = Number(replies?.[i]?.[1]);
    counts.set(roleId, Number.isNaN(value) ? 0 : value);
  });
  return counts;
}

export async function getCounts(guildId: string): Promise<Map<string, number>> {
  const raw = await container.redis.hgetall(RmKeys.count(guildId));
  const out = new Map<string, number>();
  for (const [roleId, value] of Object.entries(raw)) {
    const n = Number(value);
    if (!Number.isNaN(n) && n > 0) out.set(roleId, n);
  }
  return out;
}

export async function getRoleCount(
  guildId: string,
  roleId: string,
): Promise<number> {
  const raw = await container.redis.hget(RmKeys.count(guildId), roleId);
  const n = Number(raw);
  return Number.isNaN(n) ? 0 : n;
}

export async function resetCounts(guildId: string): Promise<void> {
  await container.redis.del(RmKeys.count(guildId));
}

// ── Protected roles (Postgres, durable) ──────────────────────────────────────

export async function setProtectedRole(
  guildId: string,
  roleId: string,
  durationMinutes: number,
): Promise<void> {
  await container.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    roleId,
    PROTECTED_KEY,
    { durationMinutes },
  );
}

export async function removeProtectedRole(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const count = await container.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    roleId,
    PROTECTED_KEY,
  );
  return count > 0;
}

export async function getProtectedRoles(
  guildId: string,
): Promise<Map<string, number>> {
  const rows = await container.db.guildKV.listModuleData<{
    durationMinutes?: number;
  }>({ module: MODULE_NAME, key: PROTECTED_KEY, guildId });
  return new Map(rows.map((r) => [r.targetId, r.value?.durationMinutes ?? 0]));
}

export async function getProtectedDuration(
  guildId: string,
  roleId: string,
): Promise<number | null> {
  const v = await container.db.guildKV.getModuleData<{
    durationMinutes?: number;
  }>(guildId, MODULE_NAME, roleId, PROTECTED_KEY);
  return v?.durationMinutes ?? null;
}

// ── Active blocks (Redis) ────────────────────────────────────────────────────

export async function getBlocks(
  guildId: string,
): Promise<Map<string, ActiveBlock>> {
  const raw = await container.redis.hgetall(RmKeys.blocks(guildId));
  const out = new Map<string, ActiveBlock>();
  for (const [roleId, value] of Object.entries(raw)) {
    const parsed = tryParseJSON(value) as ActiveBlock | null;
    if (parsed) out.set(roleId, parsed);
  }
  return out;
}

export async function getBlock(
  guildId: string,
  roleId: string,
): Promise<ActiveBlock | null> {
  const raw = await container.redis.hget(RmKeys.blocks(guildId), roleId);
  return raw ? ((tryParseJSON(raw) as ActiveBlock | null) ?? null) : null;
}

export async function setBlock(
  guildId: string,
  block: ActiveBlock,
): Promise<void> {
  await container.redis.hset(
    RmKeys.blocks(guildId),
    block.roleId,
    JSON.stringify(block),
  );
}

export async function removeBlock(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const removed = await container.redis.hdel(RmKeys.blocks(guildId), roleId);
  return removed > 0;
}

// ── Managed AutoMod rule id (Redis) ──────────────────────────────────────────

export async function getRuleId(guildId: string): Promise<string | null> {
  return container.redis.get(RmKeys.ruleId(guildId));
}

export async function setRuleId(
  guildId: string,
  ruleId: string,
): Promise<void> {
  await container.redis.set(RmKeys.ruleId(guildId), ruleId);
}

export async function clearRuleId(guildId: string): Promise<void> {
  await container.redis.del(RmKeys.ruleId(guildId));
}
