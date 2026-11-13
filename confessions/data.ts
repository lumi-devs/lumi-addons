import { createHash, randomBytes } from "node:crypto";
import type { ModuleServices } from "@lumi/module-kit";
import { ModuleName } from "./config.js";

const GuildTarget = "_";
const SaltKey = "salt";
const CounterKey = "counter";
const MetaKey = "meta";
const ReplyIndexPrefix = "r:";
const KidsPrefix = "kids:";
const DmOptPrefix = "dmopt:";
const IndexPrefix = "c:";
const BanPrefix = "ban:";
const LocalLocks = new Map<string, Promise<void>>();

async function withLocalLock<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = LocalLocks.get(key) ?? Promise.resolve();
  const { promise: current, resolve: release } =
    Promise.withResolvers<void>();
  const tail = previous.then(() => current);
  LocalLocks.set(key, tail);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (LocalLocks.get(key) === tail) LocalLocks.delete(key);
  }
}

async function withSaltLock<T>(
  services: ModuleServices,
  guildId: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockKey = `${ModuleName}:salt-lock:${guildId}`;
  return withLocalLock(lockKey, async () => {
    if (!services.helpers.cache.distributed) return task();
    const deadline = Date.now() + 5_000;
    let release: (() => Promise<void>) | null = null;
    while (!release && Date.now() < deadline) {
      release = await services.helpers.cache
        .takeLock(lockKey, 30_000)
        .catch(() => null);
      if (!release) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try {
      return await task();
    } finally {
      if (release) await release().catch(() => undefined);
    }
  });
}

export interface ConfessionMeta {
  number: number;
  channelId: string;
  threadId: string | null;
  authorHash: string;
  title?: string | null;
  text?: string | null;
  imageUrl?: string | null;
  authorId?: string | null;
}

export interface ReplyRecord {
  path: string;
  number: number;
  parentPath: string | null;
  authorHash: string;
  authorId?: string | null;
  text: string;
  imageUrl: string | null;
  isOp: boolean;
  messageId: string;
  channelId: string;
  createdAt: number;
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
  clearedAuthorLinks: number;
  dmOptOutCleared: boolean;
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
  return withSaltLock(services, guildId, async () => {
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
  });
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

export async function nextReplyPath(
  services: ModuleServices,
  guildId: string,
  number: number,
  parentPath: string | null,
): Promise<string> {
  const base = parentPath ?? String(number);
  const index = await services.helpers.moduleData.incr(
    guildId,
    ModuleName,
    GuildTarget,
    `${KidsPrefix}${base}`,
  );
  return `${base}.${index}`;
}

export async function saveReply(
  services: ModuleServices,
  guildId: string,
  reply: ReplyRecord,
): Promise<void> {
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    GuildTarget,
    `${ReplyIndexPrefix}${reply.path}`,
    reply,
  );
}

export async function getReply(
  services: ModuleServices,
  guildId: string,
  path: string,
): Promise<ReplyRecord | null> {
  return services.helpers.moduleData.get<ReplyRecord>(
    guildId,
    ModuleName,
    GuildTarget,
    `${ReplyIndexPrefix}${path}`,
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
  await services.helpers.moduleData.delete(
    guildId,
    ModuleName,
    GuildTarget,
    `${ReportedPrefix}${number}`,
  );

  const [replies, counters] = await Promise.all([
    services.helpers.moduleData.list<ReplyRecord>({
      guildId,
      moduleName: ModuleName,
      targetId: GuildTarget,
      prefix: `${ReplyIndexPrefix}${number}.`,
      limit: 5000,
    }),
    services.helpers.moduleData.list<unknown>({
      guildId,
      moduleName: ModuleName,
      targetId: GuildTarget,
      prefix: `${KidsPrefix}${number}`,
      limit: 5000,
    }),
  ]);
  await Promise.all([
    ...replies.map((entry) =>
      services.helpers.moduleData.delete(
        guildId,
        ModuleName,
        GuildTarget,
        entry.key,
      ),
    ),
    ...counters.map((entry) =>
      services.helpers.moduleData.delete(
        guildId,
        ModuleName,
        GuildTarget,
        entry.key,
      ),
    ),
  ]);
}

const ReportedPrefix = "reported:";

export interface TimestampMarker {
  at: number;
}

export function confessionReportKey(number: number): string {
  return `${ReportedPrefix}${number}`;
}

export function replyReportKey(path: string): string {
  return `${ReportedPrefix}reply:${path}`;
}

export async function isReported(
  services: ModuleServices,
  guildId: string,
  key: string,
): Promise<boolean> {
  const marker = await services.helpers.moduleData.get<TimestampMarker>(
    guildId,
    ModuleName,
    GuildTarget,
    key,
  );
  return marker !== null;
}

export async function markReported(
  services: ModuleServices,
  guildId: string,
  key: string,
): Promise<void> {
  const marker: TimestampMarker = { at: Date.now() };
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    GuildTarget,
    key,
    marker,
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

export async function claimCooldown(
  services: ModuleServices,
  guildId: string,
  authorHash: string,
  minutes: number,
): Promise<boolean> {
  const ttlMs = minutes * 60_000;
  if (ttlMs <= 0) return true;
  return services.helpers.cache
    .setNx(cooldownKey(guildId, authorHash), String(Date.now()), ttlMs)
    .catch(() => true);
}

export async function clearCooldown(
  services: ModuleServices,
  guildId: string,
  authorHash: string,
): Promise<void> {
  await services.helpers.cache.del(cooldownKey(guildId, authorHash));
}

export async function setReplyDmOptOut(
  services: ModuleServices,
  guildId: string,
  userId: string,
  optOut: boolean,
): Promise<void> {
  if (optOut) {
    const marker: TimestampMarker = { at: Date.now() };
    await services.helpers.moduleData.set(
      guildId,
      ModuleName,
      GuildTarget,
      `${DmOptPrefix}${userId}`,
      marker,
    );
    return;
  }
  await services.helpers.moduleData.delete(
    guildId,
    ModuleName,
    GuildTarget,
    `${DmOptPrefix}${userId}`,
  );
}

export async function hasReplyDmOptOut(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<boolean> {
  const marker = await services.helpers.moduleData.get<TimestampMarker>(
    guildId,
    ModuleName,
    GuildTarget,
    `${DmOptPrefix}${userId}`,
  );
  return marker !== null;
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
  const clearedAuthorLinks = await clearAuthorLinks(
    services,
    guildId,
    userId,
  );
  const dmOptOutCleared = await hasReplyDmOptOut(services, guildId, userId);
  await setReplyDmOptOut(services, guildId, userId, false);

  const salt = await readSalt(services, guildId);
  if (!salt) {
    return {
      deleted: 0,
      cooldownCleared: false,
      clearedAuthorLinks,
      dmOptOutCleared,
    };
  }

  const authorHash = hashAuthor(salt, userId);
  const cooldownCleared = await onCooldown(services, guildId, authorHash);
  const deleted = await unbanAuthor(services, guildId, authorHash);
  if (cooldownCleared) {
    await clearCooldown(services, guildId, authorHash);
  }
  return { deleted, cooldownCleared, clearedAuthorLinks, dmOptOutCleared };
}

async function clearAuthorLinks(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  let cleared = 0;
  const confessions = await listRecentConfessions(services, guildId);
  for (const { number } of confessions) {
    const record = await getConfession(services, guildId, number);
    if (record?.meta.authorId !== userId) continue;
    await services.helpers.moduleData.set(
      guildId,
      ModuleName,
      record.index.messageId,
      MetaKey,
      { ...record.meta, authorId: null },
    );
    cleared += 1;
  }

  const replies = await services.helpers.moduleData.list<ReplyRecord>({
    guildId,
    moduleName: ModuleName,
    targetId: GuildTarget,
    prefix: ReplyIndexPrefix,
    limit: 5000,
  });
  for (const entry of replies) {
    if (entry.value.authorId !== userId) continue;
    await services.helpers.moduleData.set(
      guildId,
      ModuleName,
      GuildTarget,
      `${ReplyIndexPrefix}${entry.value.path}`,
      { ...entry.value, authorId: null },
    );
    cleared += 1;
  }
  return cleared;
}
