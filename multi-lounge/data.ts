import { createHash } from "node:crypto";
import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";

export const ModuleName = "multi-lounge";
export const ConfigKey = "multi-lounge-config";

const Scope = "_";
const GroupPrefix = "group:";
const StatsKey = "stats";
const MaxKeyLength = 128;

export const ConfigSchema = z.object({
  baseChannelIds: z.array(z.string().min(1)).default([]),
  busyThreshold: z.number().int().min(1).max(99).default(2),
  maxExtras: z.number().int().min(1).max(25).default(5),
  nameTemplate: z.string().trim().min(1).max(100).default("Lounge {n}"),
  creationCooldownSeconds: z.number().int().min(0).max(300).default(10),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface ExtraLounge {
  channelId: string;
  number: number;
}

export interface ManagedGroup {
  baseId: string;
  extras: ExtraLounge[];
}

export interface LoungeStats {
  creations: number;
  deletions: number;
  peakUsers: number;
}

export function loungeName(template: string, n: number): string {
  return template.replace(/\{n\}/g, String(n));
}

export function nextFreeNumber(used: readonly number[]): number {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(n)) n += 1;
  return n;
}

export function allBusy(
  counts: readonly number[],
  threshold: number,
): boolean {
  return counts.length > 0 && counts.every((count) => count >= threshold);
}

export async function getConfig(
  services: ModuleServices,
  guildId: string,
): Promise<Config> {
  let stored: unknown = null;
  try {
    stored = await services.moduleConfig.read(
      guildId,
      services.moduleName ?? ModuleName,
      ConfigKey,
    );
  } catch (error) {
    services.observability.logger.warn("multi-lounge config read failed", {
      guildId,
      error,
    });
  }

  const parsed = ConfigSchema.safeParse(stored ?? {});
  if (parsed.success) {
    return {
      ...parsed.data,
      baseChannelIds: [...new Set(parsed.data.baseChannelIds)],
    };
  }

  services.observability.logger.warn(
    "multi-lounge config invalid, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return ConfigSchema.parse({});
}

function groupKey(baseId: string): string {
  const key = `${GroupPrefix}${baseId}`;
  if (key.length <= MaxKeyLength) return key;
  const digest = createHash("sha1").update(baseId).digest("hex").slice(0, 16);
  return `${GroupPrefix}${digest}`;
}

function isExtra(value: unknown): value is ExtraLounge {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.channelId === "string" &&
    typeof record.number === "number" &&
    Number.isInteger(record.number) &&
    record.number > 0
  );
}

function toGroup(baseId: string, value: unknown): ManagedGroup {
  if (!value || typeof value !== "object") {
    return { baseId, extras: [] };
  }
  const record = value as Record<string, unknown>;
  const rawExtras = Array.isArray(record.extras) ? record.extras : [];
  const extras = rawExtras
    .filter(isExtra)
    .map((extra) => ({ channelId: extra.channelId, number: extra.number }));
  return { baseId, extras };
}

function baseIdFromEntry(value: unknown, key: string): string {
  if (value && typeof value === "object") {
    const stored = (value as Record<string, unknown>).baseId;
    if (typeof stored === "string" && stored.length > 0) return stored;
  }
  return key.startsWith(GroupPrefix) ? key.slice(GroupPrefix.length) : key;
}

export async function readGroup(
  services: ModuleServices,
  guildId: string,
  baseId: string,
): Promise<ManagedGroup> {
  const stored = await services.helpers.moduleData.get<unknown>(
    guildId,
    ModuleName,
    Scope,
    groupKey(baseId),
  );
  return toGroup(baseId, stored);
}

export async function writeGroup(
  services: ModuleServices,
  guildId: string,
  group: ManagedGroup,
): Promise<void> {
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    Scope,
    groupKey(group.baseId),
    group,
  );
}

export async function removeGroup(
  services: ModuleServices,
  guildId: string,
  baseId: string,
): Promise<void> {
  await services.helpers.moduleData.delete(
    guildId,
    ModuleName,
    Scope,
    groupKey(baseId),
  );
}

export async function listGroups(
  services: ModuleServices,
  guildId: string,
): Promise<ManagedGroup[]> {
  const rows = await services.helpers.moduleData.list<unknown>({
    guildId,
    moduleName: ModuleName,
    targetId: Scope,
    prefix: GroupPrefix,
  });
  return rows.map((row) =>
    toGroup(baseIdFromEntry(row.value, row.key), row.value),
  );
}

function normalizeStats(value: unknown): LoungeStats {
  if (!value || typeof value !== "object") {
    return { creations: 0, deletions: 0, peakUsers: 0 };
  }
  const record = value as Record<string, unknown>;
  const count = (entry: unknown): number =>
    typeof entry === "number" && Number.isFinite(entry) && entry > 0
      ? Math.trunc(entry)
      : 0;
  return {
    creations: count(record.creations),
    deletions: count(record.deletions),
    peakUsers: count(record.peakUsers),
  };
}

async function writeStats(
  services: ModuleServices,
  guildId: string,
  stats: LoungeStats,
): Promise<void> {
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    Scope,
    StatsKey,
    stats,
  );
}

export async function readStats(
  services: ModuleServices,
  guildId: string,
): Promise<LoungeStats> {
  const stored = await services.helpers.moduleData.get<unknown>(
    guildId,
    ModuleName,
    Scope,
    StatsKey,
  );
  return normalizeStats(stored);
}

export async function recordCreation(
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const stats = await readStats(services, guildId);
  stats.creations += 1;
  await writeStats(services, guildId, stats);
}

export async function recordDeletion(
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const stats = await readStats(services, guildId);
  stats.deletions += 1;
  await writeStats(services, guildId, stats);
}

export async function recordPeak(
  services: ModuleServices,
  guildId: string,
  concurrentUsers: number,
): Promise<void> {
  const stats = await readStats(services, guildId);
  if (concurrentUsers > stats.peakUsers) {
    stats.peakUsers = concurrentUsers;
    await writeStats(services, guildId, stats);
  }
}

function cooldownKey(guildId: string, baseId: string): string {
  return `lumi:multi-lounge:create:${guildId}:${baseId}`;
}

export async function claimCreationCooldown(
  services: ModuleServices,
  guildId: string,
  baseId: string,
  seconds: number,
): Promise<boolean> {
  if (seconds <= 0) return true;
  return services.helpers.cache.setNx(
    cooldownKey(guildId, baseId),
    String(Date.now()),
    seconds * 1_000,
  );
}

export async function releaseCreationCooldown(
  services: ModuleServices,
  guildId: string,
  baseId: string,
): Promise<void> {
  await services.helpers.cache.del(cooldownKey(guildId, baseId));
}