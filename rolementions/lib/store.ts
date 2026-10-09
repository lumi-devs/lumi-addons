import { get, incr, list, remove, set } from "lumi/kv";
import {
  BLOCK_KEY,
  COUNT_KEY,
  PROTECTED_KEY,
  countTarget,
  dayStamp,
} from "./keys.js";

export interface ActiveBlock {
  roleId: string;
  roleName?: string;
  createdAt: number;
  expiresAt: number;
  durationMinutes: number;
  manual: boolean;
}

function parseBlock(value: unknown): ActiveBlock | null {
  if (!value || typeof value !== "object") return null;
  const b = value as Partial<ActiveBlock>;
  if (typeof b["roleId"] !== "string" || typeof b["expiresAt"] !== "number") {
    return null;
  }
  return {
    roleId: b["roleId"],
    roleName: typeof b["roleName"] === "string" ? b["roleName"] : undefined,
    createdAt: typeof b["createdAt"] === "number" ? b["createdAt"] : Date.now(),
    expiresAt: b["expiresAt"],
    durationMinutes:
      typeof b["durationMinutes"] === "number" ? b["durationMinutes"] : 0,
    manual: b["manual"] === true,
  };
}

export async function incrementMentions(
  guildId: string,
  roleIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (roleIds.length === 0) return counts;
  const day = dayStamp();
  for (const roleId of roleIds) {
    const value = await incr(guildId, countTarget(day, roleId), COUNT_KEY, 1);
    counts.set(roleId, value);
  }
  return counts;
}

export async function getCounts(guildId: string): Promise<Map<string, number>> {
  const rows = await list<number>(COUNT_KEY, guildId);
  const out = new Map<string, number>();
  const today = dayStamp();
  for (const row of rows) {
    const sep = row.targetId.indexOf(":");
    if (sep < 0) {
      await remove(guildId, row.targetId, COUNT_KEY);
      continue;
    }
    const day = row.targetId.slice(0, sep);
    const roleId = row.targetId.slice(sep + 1);
    if (day !== today) {
      await remove(guildId, row.targetId, COUNT_KEY);
      continue;
    }
    const n = Number(row.value);
    if (!Number.isNaN(n) && n > 0) out.set(roleId, n);
  }
  return out;
}

export async function getRoleCount(
  guildId: string,
  roleId: string,
): Promise<number> {
  const raw = await get<number>(guildId, countTarget(dayStamp(), roleId), COUNT_KEY);
  const n = Number(raw);
  return Number.isNaN(n) ? 0 : n;
}

export async function resetCounts(guildId: string): Promise<void> {
  const rows = await list<number>(COUNT_KEY, guildId);
  for (const row of rows) await remove(guildId, row.targetId, COUNT_KEY);
}

export async function setProtectedRole(
  guildId: string,
  roleId: string,
  durationMinutes: number,
): Promise<void> {
  await set(guildId, roleId, PROTECTED_KEY, { durationMinutes });
}

export async function removeProtectedRole(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  return (await remove(guildId, roleId, PROTECTED_KEY)) > 0;
}

export async function getProtectedRoles(
  guildId: string,
): Promise<Map<string, number>> {
  const rows = await list<{ durationMinutes?: number }>(PROTECTED_KEY, guildId);
  return new Map(rows.map((r) => [r.targetId, r.value?.durationMinutes ?? 0]));
}

export async function getBlocks(
  guildId: string,
): Promise<Map<string, ActiveBlock>> {
  const rows = await list<unknown>(BLOCK_KEY, guildId);
  const out = new Map<string, ActiveBlock>();
  const now = Date.now();
  for (const row of rows) {
    const parsed = parseBlock(row.value);
    if (!parsed) continue;
    if (parsed.expiresAt <= now) {
      await remove(guildId, row.targetId, BLOCK_KEY);
      continue;
    }
    out.set(row.targetId, parsed);
  }
  return out;
}

export async function getBlock(
  guildId: string,
  roleId: string,
): Promise<ActiveBlock | null> {
  const block = parseBlock(await get(guildId, roleId, BLOCK_KEY));
  if (!block) return null;
  if (block.expiresAt <= Date.now()) {
    await remove(guildId, roleId, BLOCK_KEY);
    return null;
  }
  return block;
}

export async function setBlock(
  guildId: string,
  block: ActiveBlock,
): Promise<void> {
  await set(guildId, block.roleId, BLOCK_KEY, block);
}

export async function removeBlock(
  guildId: string,
  roleId: string,
): Promise<boolean> {
  return (await remove(guildId, roleId, BLOCK_KEY)) > 0;
}
