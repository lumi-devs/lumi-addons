import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { randomBytes } from "node:crypto";
import {
  BAN_KEY,
  CONFIG_SCOPE,
  CONFESSION_META_KEY,
  COUNTER_KEY,
  COOLDOWN_KEY,
  DM_OPT_OUT_KEY,
  MODULE_NAME,
  REPLY_COUNTER_KEY,
  SALT_KEY,
  confessionAuthorKey,
  confessionTarget,
  replyAuthorKey,
  replyKey,
  type BanRecord,
  type ConfessionMeta,
  type ReplyRecord,
} from "./Keys.js";
import { hashAuthor } from "./Anon.js";

export async function getSalt(services: Container, guildId: string): Promise<string> {
  const existing = await services.db.guildKV.getModuleData<string>(
    guildId,
    MODULE_NAME,
    CONFIG_SCOPE,
    SALT_KEY,
  );
  if (existing) return existing;
  const salt = randomBytes(32).toString("hex");
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    CONFIG_SCOPE,
    SALT_KEY,
    salt,
  );
  return salt;
}

export async function authorHashFor(
  services: Container,
  guildId: string,
  userId: string,
): Promise<string> {
  return hashAuthor(await getSalt(services, guildId), userId);
}

export async function nextConfessionNumber(services: Container, guildId: string): Promise<number> {
  return services.db.guildKV.incrModuleData(
    guildId,
    MODULE_NAME,
    CONFIG_SCOPE,
    COUNTER_KEY,
  );
}

export async function nextReplyNumber(
  services: Container,
  guildId: string,
  confessionNumber: number,
): Promise<number> {
  return services.db.guildKV.incrModuleData(
    guildId,
    MODULE_NAME,
    confessionTarget(confessionNumber),
    REPLY_COUNTER_KEY,
  );
}

export async function saveConfession(
  services: Container,
  guildId: string,
  meta: ConfessionMeta,
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    confessionTarget(meta.number),
    CONFESSION_META_KEY,
    meta,
  );
}

export async function getConfession(
  services: Container,
  guildId: string,
  number: number,
): Promise<ConfessionMeta | null> {
  return services.db.guildKV.getModuleData<ConfessionMeta>(
    guildId,
    MODULE_NAME,
    confessionTarget(number),
    CONFESSION_META_KEY,
  );
}

export async function deleteConfession(
  services: Container,
  guildId: string,
  number: number,
): Promise<void> {
  const target = confessionTarget(number);
  await services.db.guildKV.deleteModuleData(guildId, MODULE_NAME, target, CONFESSION_META_KEY);
  await services.db.guildKV.deleteModuleData(guildId, MODULE_NAME, target, REPLY_COUNTER_KEY);
}

export async function saveReply(
  services: Container,
  guildId: string,
  confessionNumber: number,
  k: number,
  record: ReplyRecord,
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    confessionTarget(confessionNumber),
    replyKey(k),
    record,
  );
}

export async function getReply(
  services: Container,
  guildId: string,
  confessionNumber: number,
  k: number,
): Promise<ReplyRecord | null> {
  return services.db.guildKV.getModuleData<ReplyRecord>(
    guildId,
    MODULE_NAME,
    confessionTarget(confessionNumber),
    replyKey(k),
  );
}

export async function recordConfessionAuthor(
  services: Container,
  guildId: string,
  number: number,
  userId: string,
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    userId,
    confessionAuthorKey(number),
    { at: Date.now() },
  );
}

export async function recordReplyAuthor(
  services: Container,
  guildId: string,
  number: number,
  k: number,
  userId: string,
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    userId,
    replyAuthorKey(number, k),
    { at: Date.now() },
  );
}

export async function findConfessionAuthor(
  services: Container,
  guildId: string,
  number: number,
): Promise<string | null> {
  const rows = await services.db.guildKV.listModuleData({
    module: MODULE_NAME,
    key: confessionAuthorKey(number),
    guildId,
  });
  return rows[0]?.targetId ?? null;
}

export async function findReplyAuthor(
  services: Container,
  guildId: string,
  number: number,
  k: number,
): Promise<string | null> {
  const rows = await services.db.guildKV.listModuleData({
    module: MODULE_NAME,
    key: replyAuthorKey(number, k),
    guildId,
  });
  return rows[0]?.targetId ?? null;
}

export async function setReplyDmOptOut(
  services: Container,
  guildId: string,
  userId: string,
  off: boolean,
): Promise<void> {
  if (off) {
    await services.db.guildKV.setModuleData(
      guildId,
      MODULE_NAME,
      userId,
      DM_OPT_OUT_KEY,
      { at: Date.now() },
    );
  } else {
    await services.db.guildKV.deleteModuleData(
      guildId,
      MODULE_NAME,
      userId,
      DM_OPT_OUT_KEY,
    );
  }
}

export async function hasReplyDmOptOut(
  services: Container,
  guildId: string,
  userId: string,
): Promise<boolean> {
  const r = await services.db.guildKV.getModuleData(
    guildId,
    MODULE_NAME,
    userId,
    DM_OPT_OUT_KEY,
  );
  return r !== null;
}

export async function banHash(
  services: Container,
  guildId: string,
  hash: string,
  by: string,
): Promise<void> {
  await services.db.guildKV.setModuleData<BanRecord>(
    guildId,
    MODULE_NAME,
    hash,
    BAN_KEY,
    { at: Date.now(), by },
  );
}

export async function unbanHash(
  services: Container,
  guildId: string,
  hash: string,
): Promise<number> {
  return services.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    hash,
    BAN_KEY,
  );
}

export async function isBanned(
  services: Container,
  guildId: string,
  hash: string,
): Promise<boolean> {
  const b = await services.db.guildKV.getModuleData<BanRecord>(
    guildId,
    MODULE_NAME,
    hash,
    BAN_KEY,
  );
  return b !== null;
}

export async function listBans(
  services: Container,
  guildId: string,
): Promise<{ hash: string; record: BanRecord }[]> {
  const rows = await services.db.guildKV.listModuleData<BanRecord>({
    module: MODULE_NAME,
    key: BAN_KEY,
    guildId,
  });
  return rows.map((r) => ({ hash: r.targetId, record: r.value }));
}

export async function onCooldown(
  services: Container,
  guildId: string,
  hash: string,
  minutes: number,
): Promise<boolean> {
  if (minutes <= 0) return false;
  const last = await services.db.guildKV.getModuleData<number>(
    guildId,
    MODULE_NAME,
    hash,
    COOLDOWN_KEY,
  );
  return last !== null && Date.now() - last < minutes * 60_000;
}

export async function setCooldown(
  services: Container,
  guildId: string,
  hash: string,
  minutes: number,
): Promise<void> {
  if (minutes <= 0) return;
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    hash,
    COOLDOWN_KEY,
    Date.now(),
  );
}
