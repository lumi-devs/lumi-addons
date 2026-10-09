import { get, incr, list, remove, set } from "lumi/kv";
import { randomBytes } from "node:crypto";
import {
  BAN_KEY,
  CONFIG_SCOPE,
  CONFESSION_META_KEY,
  COUNTER_KEY,
  COOLDOWN_KEY,
  REPLY_COUNTER_KEY,
  SALT_KEY,
  confessionTarget,
  replyKey,
  type BanRecord,
  type ConfessionMeta,
  type ReplyRecord,
} from "../keys.js";
import { hashAuthor } from "./anon.js";

export async function getSalt(guildId: string): Promise<string> {
  const existing = await get<string>(guildId, CONFIG_SCOPE, SALT_KEY);
  if (existing) return existing;
  const salt = randomBytes(32).toString("hex");
  await set(guildId, CONFIG_SCOPE, SALT_KEY, salt);
  return salt;
}

export async function authorHashFor(
  guildId: string,
  userId: string,
): Promise<string> {
  return hashAuthor(await getSalt(guildId), userId);
}

export async function nextConfessionNumber(guildId: string): Promise<number> {
  return incr(guildId, CONFIG_SCOPE, COUNTER_KEY);
}

export async function nextReplyNumber(
  guildId: string,
  confessionNumber: number,
): Promise<number> {
  return incr(guildId, confessionTarget(confessionNumber), REPLY_COUNTER_KEY);
}

export async function saveConfession(
  guildId: string,
  meta: ConfessionMeta,
): Promise<void> {
  await set(guildId, confessionTarget(meta.number), CONFESSION_META_KEY, meta);
}

export async function getConfession(
  guildId: string,
  number: number,
): Promise<ConfessionMeta | null> {
  return get<ConfessionMeta>(
    guildId,
    confessionTarget(number),
    CONFESSION_META_KEY,
  );
}

export async function deleteConfession(
  guildId: string,
  number: number,
): Promise<void> {
  const target = confessionTarget(number);
  await remove(guildId, target, CONFESSION_META_KEY);
  await remove(guildId, target, REPLY_COUNTER_KEY);
}

export async function saveReply(
  guildId: string,
  confessionNumber: number,
  k: number,
  record: ReplyRecord,
): Promise<void> {
  await set(guildId, confessionTarget(confessionNumber), replyKey(k), record);
}

export async function getReply(
  guildId: string,
  confessionNumber: number,
  k: number,
): Promise<ReplyRecord | null> {
  return get<ReplyRecord>(
    guildId,
    confessionTarget(confessionNumber),
    replyKey(k),
  );
}

export async function banHash(
  guildId: string,
  hash: string,
  by: string,
): Promise<void> {
  await set<BanRecord>(guildId, hash, BAN_KEY, { at: Date.now(), by });
}

export async function unbanHash(
  guildId: string,
  hash: string,
): Promise<number> {
  return remove(guildId, hash, BAN_KEY);
}

export async function isBanned(
  guildId: string,
  hash: string,
): Promise<boolean> {
  return (await get<BanRecord>(guildId, hash, BAN_KEY)) !== null;
}

export async function listBans(
  guildId: string,
): Promise<{ hash: string; record: BanRecord }[]> {
  const rows = await list<BanRecord>(BAN_KEY, guildId);
  return rows.map((r) => ({ hash: r.targetId, record: r.value }));
}

export async function onCooldown(
  guildId: string,
  hash: string,
  minutes: number,
): Promise<boolean> {
  if (minutes <= 0) return false;
  const last = await get<number>(guildId, hash, COOLDOWN_KEY);
  return last !== null && Date.now() - last < minutes * 60_000;
}

export async function setCooldown(
  guildId: string,
  hash: string,
  minutes: number,
): Promise<void> {
  if (minutes <= 0) return;
  await set(guildId, hash, COOLDOWN_KEY, Date.now());
}
