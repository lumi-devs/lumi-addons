import { container } from "@sapphire/framework";
import { AsyncQueue } from "@sapphire/async-queue";
import { randomBytes } from "node:crypto";
import {
  MODULE_NAME,
  CONFIG_SCOPE,
  SALT_KEY,
  COUNTER_KEY,
  confessionTarget,
  CONFESSION_META_KEY,
  REPLY_COUNTER_KEY,
  replyTarget,
  AUTHOR_KEY,
  BAN_KEY,
  ConfessKeys,
  type ConfessionMeta,
  type BanRecord,
} from "../keys.js";
import { hashAuthor } from "./anon.js";

const kv = () => container.db.guildKV;

// Per-guild serialization for the confession + reply counters — increments must
// not race. KV is Postgres-backed, so the numbers survive cache flushes.
const counterQueues = new Map<string, AsyncQueue>();
const queueFor = (guildId: string): AsyncQueue => {
  let q = counterQueues.get(guildId);
  if (!q) counterQueues.set(guildId, (q = new AsyncQueue()));
  return q;
};

// ── Anonymity ────────────────────────────────────────────────────────────────

export async function getSalt(guildId: string): Promise<string> {
  const existing = await kv().getModuleData<string>(
    guildId,
    MODULE_NAME,
    CONFIG_SCOPE,
    SALT_KEY,
  );
  if (existing) return existing;
  const salt = randomBytes(32).toString("hex");
  await kv().setModuleData(guildId, MODULE_NAME, CONFIG_SCOPE, SALT_KEY, salt);
  return salt;
}

export async function authorHashFor(
  guildId: string,
  userId: string,
): Promise<string> {
  return hashAuthor(await getSalt(guildId), userId);
}

// ── Counters ─────────────────────────────────────────────────────────────────

export async function nextConfessionNumber(guildId: string): Promise<number> {
  const q = queueFor(guildId);
  await q.wait();
  try {
    const current =
      (await kv().getModuleData<number>(
        guildId,
        MODULE_NAME,
        CONFIG_SCOPE,
        COUNTER_KEY,
      )) ?? 0;
    const next = current + 1;
    await kv().setModuleData(
      guildId,
      MODULE_NAME,
      CONFIG_SCOPE,
      COUNTER_KEY,
      next,
    );
    return next;
  } finally {
    q.shift();
  }
}

export async function nextReplyNumber(
  guildId: string,
  confessionNumber: number,
): Promise<number> {
  const q = queueFor(guildId);
  await q.wait();
  try {
    const target = confessionTarget(confessionNumber);
    const current =
      (await kv().getModuleData<number>(
        guildId,
        MODULE_NAME,
        target,
        REPLY_COUNTER_KEY,
      )) ?? 0;
    const next = current + 1;
    await kv().setModuleData(
      guildId,
      MODULE_NAME,
      target,
      REPLY_COUNTER_KEY,
      next,
    );
    return next;
  } finally {
    q.shift();
  }
}

// ── Confession + reply records ───────────────────────────────────────────────

export async function saveConfession(
  guildId: string,
  meta: ConfessionMeta,
): Promise<void> {
  await kv().setModuleData(
    guildId,
    MODULE_NAME,
    confessionTarget(meta.number),
    CONFESSION_META_KEY,
    meta,
  );
}

export async function getConfession(
  guildId: string,
  number: number,
): Promise<ConfessionMeta | null> {
  return kv().getModuleData<ConfessionMeta>(
    guildId,
    MODULE_NAME,
    confessionTarget(number),
    CONFESSION_META_KEY,
  );
}

export async function deleteConfession(
  guildId: string,
  number: number,
): Promise<void> {
  const target = confessionTarget(number);
  await kv().deleteModuleData(
    guildId,
    MODULE_NAME,
    target,
    CONFESSION_META_KEY,
  );
  await kv().deleteModuleData(guildId, MODULE_NAME, target, REPLY_COUNTER_KEY);
}

export async function saveReplyAuthor(
  guildId: string,
  messageId: string,
  authorHash: string,
): Promise<void> {
  await kv().setModuleData(
    guildId,
    MODULE_NAME,
    replyTarget(messageId),
    AUTHOR_KEY,
    authorHash,
  );
}

// ── Bans (by author hash) ────────────────────────────────────────────────────

export async function banHash(
  guildId: string,
  hash: string,
  by: string,
): Promise<void> {
  await kv().setModuleData<BanRecord>(guildId, MODULE_NAME, hash, BAN_KEY, {
    at: Date.now(),
    by,
  });
}

export async function unbanHash(
  guildId: string,
  hash: string,
): Promise<number> {
  return kv().deleteModuleData(guildId, MODULE_NAME, hash, BAN_KEY);
}

export async function isBanned(
  guildId: string,
  hash: string,
): Promise<boolean> {
  return (
    (await kv().getModuleData<BanRecord>(
      guildId,
      MODULE_NAME,
      hash,
      BAN_KEY,
    )) !== null
  );
}

export async function listBans(
  guildId: string,
): Promise<{ hash: string; record: BanRecord }[]> {
  const rows = await kv().listModuleData<BanRecord>({
    module: MODULE_NAME,
    key: BAN_KEY,
    guildId,
  });
  return rows.map((r) => ({ hash: r.targetId, record: r.value }));
}

// ── Cooldown (Redis) ─────────────────────────────────────────────────────────

export async function onCooldown(
  guildId: string,
  hash: string,
): Promise<boolean> {
  return (
    (await container.redis.exists(ConfessKeys.cooldown(guildId, hash))) === 1
  );
}

export async function setCooldown(
  guildId: string,
  hash: string,
  minutes: number,
): Promise<void> {
  if (minutes <= 0) return;
  await container.redis.set(
    ConfessKeys.cooldown(guildId, hash),
    "1",
    "EX",
    Math.ceil(minutes * 60),
  );
}

// ── GDPR ─────────────────────────────────────────────────────────────────────

export async function deleteForUser(
  guildId: string,
  userId: string,
): Promise<void> {
  const hash = await authorHashFor(guildId, userId);
  await kv().deleteModuleData(guildId, MODULE_NAME, hash, BAN_KEY);
  await container.redis.del(ConfessKeys.cooldown(guildId, hash));

  const metas = await kv().listModuleData<ConfessionMeta>({
    module: MODULE_NAME,
    key: CONFESSION_META_KEY,
    guildId,
  });
  for (const row of metas)
    if (row.value.authorHash === hash)
      await deleteConfession(guildId, row.value.number);

  const replies = await kv().listModuleData<string>({
    module: MODULE_NAME,
    key: AUTHOR_KEY,
    guildId,
  });
  for (const row of replies)
    if (row.value === hash)
      await kv().deleteModuleData(
        guildId,
        MODULE_NAME,
        row.targetId,
        AUTHOR_KEY,
      );
}
