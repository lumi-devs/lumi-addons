import { createHash, randomBytes } from "node:crypto";
import type { ModuleServices } from "@lumi/module-kit";
import { ModuleName } from "./config.js";

const GuildTarget = "_";
const SaltKey = "salt";
const CounterKey = "counter";
const ReplyCounterKey = "replies";
const MetaKey = "meta";
const IndexPrefix = "c:";
const BanPrefix = "ban:";

export interface ConfessionMeta {
  number: number;
  channelId: string;
  threadId: string | null;
  authorHash: string;
}

export interface ConfessionIndex {
  messageId: string;
  channelId: string;
  threadId: string | null;
}

export interface ConfessionRecord {
  meta: ConfessionMeta;
  index: ConfessionIndex;
}

export interface ConfessionListItem {
  number: number;
  index: ConfessionIndex;
}

export interface BanRecord {
  number: number;
  at: number;
}

export interface UserHashStatus {
  banned: boolean;
  cooldown: boolean;
}

export interface UserHashEraseResult {
  deleted: number;
  cooldownCleared: boolean;
}

export function hashAuthor(salt: string, userId: string): string {
  return createHash("sha256").update(`${salt}${userId}`).digest("hex");
}

export async function readSalt(
  services: ModuleServices,
  guildId: string,
): Promise<string | null> {
  return services.helpers.moduleData.get<string>(
    guildId,
    ModuleName,
    GuildTarget,
    SaltKey,
  );
}

export async function getSalt(
  services: ModuleServices,
  guildId: string,
): Promise<string> {
  const existing = await readSalt(services, guildId);
  if (existing) return existing;

  const salt = randomBytes(32).toString("hex");
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    GuildTarget,
    SaltKey,
    salt,
  );
  return salt;
}

export async function authorHashFor(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<string> {
  return hashAuthor(await getSalt(services, guildId), userId);
}

export async function nextConfessionNumber(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  return services.helpers.moduleData.incr(
    guildId,
    ModuleName,
    GuildTarget,
    CounterKey,
  );
}

export async function nextReplyNumber(
  services: ModuleServices,
  guildId: string,
  messageId: string,
): Promise<number> {
  return services.helpers.moduleData.incr(
    guildId,
    ModuleName,
    messageId,
    ReplyCounterKey,
  );
}

export async function saveConfession(
  services: ModuleServices,
  guildId: string,
  meta: ConfessionMeta,
  index: ConfessionIndex,
): Promise<void> {
  await Promise.all([
    services.helpers.moduleData.set(
      guildId,
      ModuleName,
      index.messageId,
      MetaKey,
      meta,
    ),
    services.helpers.moduleData.set(
      guildId,
      ModuleName,
      GuildTarget,
      `${IndexPrefix}${meta.number}`,
      index,
    ),
  ]);
}

export async function getConfession(
  services: ModuleServices,
  guildId: string,
  number: number,
): Promise<ConfessionRecord | null> {
  const index = await services.helpers.moduleData.get<ConfessionIndex>(
    guildId,
    ModuleName,
    GuildTarget,
    `${IndexPrefix}${number}`,
  );
  if (!index) return null;

  const meta = await services.helpers.moduleData.get<ConfessionMeta>(
    guildId,
    ModuleName,
    index.messageId,
    MetaKey,
  );
  if (!meta) return null;
  return { meta, index };
}

export async function listRecentConfessions(
  services: ModuleServices,
  guildId: string,
): Promise<ConfessionListItem[]> {
  const entries = await services.helpers.moduleData.list<ConfessionIndex>({
    guildId,
    moduleName: ModuleName,
    targetId: GuildTarget,
    prefix: IndexPrefix,
    limit: 1000,
  });

  const items: ConfessionListItem[] = [];
  for (const entry of entries) {
    const number = Number(entry.key.slice(IndexPrefix.length));
    if (!Number.isInteger(number) || number < 1) continue;
    items.push({ number, index: entry.value });
  }
  items.sort((a, b) => b.number - a.number);
  return items;
}

export async function deleteConfessionRecords(
  services: ModuleServices,
  guildId: string,
  number: number,
  messageId: string,
): Promise<void> {
  await services.helpers.moduleData.deleteTarget(
    guildId,
    ModuleName,
    messageId,
  );
  await services.helpers.moduleData.delete(
    guildId,
    ModuleName,
    GuildTarget,
    `${IndexPrefix}${number}`,
  );
}

export async function banAuthor(
  services: ModuleServices,
  guildId: string,
  authorHash: string,
  number: number,
): Promise<void> {
  const record: BanRecord = { number, at: Date.now() };
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    GuildTarget,
    `${BanPrefix}${authorHash}`,
    record,
  );
}

export async function unbanAuthor(
  services: ModuleServices,
  guildId: string,
  authorHash: string,
): Promise<number> {
  return services.helpers.moduleData.delete(
    guildId,
    ModuleName,
    GuildTarget,
    `${BanPrefix}${authorHash}`,
  );
}

export async function isBanned(
  services: ModuleServices,
  guildId: string,
  authorHash: string,
): Promise<boolean> {
  const record = await services.helpers.moduleData.get<BanRecord>(
    guildId,
    ModuleName,
    GuildTarget,
    `${BanPrefix}${authorHash}`,
  );
  return record !== null;
}

function cooldownKey(guildId: string, authorHash: string): string {
  return `${ModuleName}:cooldown:${guildId}:${authorHash}`;
}

export async function onCooldown(
  services: ModuleServices,
  guildId: string,
  authorHash: string,
): Promise<boolean> {
  const value = await services.helpers.cache.get<number>(
    cooldownKey(guildId, authorHash),
  );
  return value !== null;
}

export async function setCooldown(
  services: ModuleServices,
  guildId: string,
  authorHash: string,
  minutes: number,
): Promise<void> {
  const ttlMs = minutes * 60_000;
  if (ttlMs <= 0) return;
  await services.helpers.cache.set(
    cooldownKey(guildId, authorHash),
    Date.now(),
    ttlMs,
  );
}

export async function clearCooldown(
  services: ModuleServices,
  guildId: string,
  authorHash: string,
): Promise<void> {
  await services.helpers.cache.del(cooldownKey(guildId, authorHash));
}

export async function readUserHashStatus(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<UserHashStatus | null> {
  const salt = await readSalt(services, guildId);
  if (!salt) return null;

  const authorHash = hashAuthor(salt, userId);
  const [banned, cooldown] = await Promise.all([
    isBanned(services, guildId, authorHash),
    onCooldown(services, guildId, authorHash),
  ]);
  return { banned, cooldown };
}

export async function eraseUserHashData(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<UserHashEraseResult> {
  const salt = await readSalt(services, guildId);
  if (!salt) return { deleted: 0, cooldownCleared: false };

  const authorHash = hashAuthor(salt, userId);
  const cooldownCleared = await onCooldown(services, guildId, authorHash);
  const deleted = await unbanAuthor(services, guildId, authorHash);
  if (cooldownCleared) {
    await clearCooldown(services, guildId, authorHash);
  }
  return { deleted, cooldownCleared };
}
