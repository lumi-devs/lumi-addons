import type { ModuleServices } from "@lumi/module-kit";
import { withKeyLock } from "@lumi/module-kit";
import { z } from "zod";
import { ModuleName } from "./config.js";

export const MentionsPrefix = "mentions:";
export const BlockKey = "block";
export const MentionsRetentionMs = 48 * 60 * 60 * 1000;
const BlockSafetyTtlMs = 7 * 24 * 60 * 60 * 1000;

const DayPattern = /^\d{4}-\d{2}-\d{2}$/;

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function mentionsKey(day: string): string {
  return `${MentionsPrefix}${day}`;
}

export async function recordRoleMentions(
  services: ModuleServices,
  guildId: string,
  roleIds: readonly string[],
): Promise<void> {
  const day = utcDayKey();
  const key = mentionsKey(day);
  const moduleName = services.moduleName ?? ModuleName;

  await Promise.all(
    [...new Set(roleIds)].map((roleId) =>
      withKeyLock(
        services,
        `${ModuleName}:lock:mentions:${guildId}:${roleId}:${day}`,
        async () => {
          const stored = await services.helpers.moduleData.get<number>(
            guildId,
            moduleName,
            roleId,
            key,
          );
          const current =
            typeof stored === "number" && Number.isFinite(stored)
              ? Math.max(0, Math.trunc(stored))
              : 0;
          await services.helpers.moduleData.set(
            guildId,
            moduleName,
            roleId,
            key,
            current + 1,
            { ttlMs: MentionsRetentionMs },
          );
        },
      ),
    ),
  );
}

function countValue(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

export async function getTodayCounts(
  services: ModuleServices,
  guildId: string,
): Promise<Map<string, number>> {
  const entries = await services.helpers.moduleData.list<unknown>({
    guildId,
    moduleName: services.moduleName ?? ModuleName,
    prefix: mentionsKey(utcDayKey()),
    limit: 5_000,
  });

  const counts = new Map<string, number>();
  for (const entry of entries) {
    const count = countValue(entry.value);
    if (count > 0) counts.set(entry.targetId, count);
  }
  return counts;
}

export interface DailyRoleCount {
  day: string;
  count: number;
}

export async function getRoleDailyCounts(
  services: ModuleServices,
  guildId: string,
  roleId: string,
): Promise<DailyRoleCount[]> {
  const entries = await services.helpers.moduleData.list<unknown>({
    guildId,
    moduleName: services.moduleName ?? ModuleName,
    targetId: roleId,
    prefix: MentionsPrefix,
    limit: 5_000,
  });

  return entries
    .map((entry) => ({
      day: entry.key.slice(MentionsPrefix.length),
      count: countValue(entry.value),
    }))
    .filter((entry) => DayPattern.test(entry.day) && entry.count > 0)
    .sort((a, b) => b.day.localeCompare(a.day));
}

export const BlockRecordSchema = z.object({
  roleId: z.string(),
  roleName: z.string(),
  expiresAt: z.number(),
  previousMentionable: z.boolean(),
});

export type BlockRecord = z.infer<typeof BlockRecordSchema>;

function parseBlock(value: unknown): BlockRecord | null {
  const parsed = BlockRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function getBlock(
  services: ModuleServices,
  guildId: string,
  roleId: string,
): Promise<BlockRecord | null> {
  const value = await services.helpers.moduleData.get<unknown>(
    guildId,
    services.moduleName ?? ModuleName,
    roleId,
    BlockKey,
  );
  return parseBlock(value);
}

export async function listBlocks(
  services: ModuleServices,
  guildId: string,
): Promise<BlockRecord[]> {
  const entries = await services.helpers.moduleData.list<unknown>({
    guildId,
    moduleName: services.moduleName ?? ModuleName,
    key: BlockKey,
    limit: 5_000,
  });

  const blocks: BlockRecord[] = [];
  for (const entry of entries) {
    const block = parseBlock(entry.value);
    if (block) blocks.push(block);
  }
  return blocks;
}

export async function setBlock(
  services: ModuleServices,
  guildId: string,
  block: BlockRecord,
): Promise<void> {
  await services.helpers.moduleData.set(
    guildId,
    services.moduleName ?? ModuleName,
    block.roleId,
    BlockKey,
    block,
    {
      ttlMs:
        Math.max(0, block.expiresAt - Date.now()) + BlockSafetyTtlMs,
    },
  );
}

export async function deleteBlock(
  services: ModuleServices,
  guildId: string,
  roleId: string,
): Promise<number> {
  return services.helpers.moduleData.delete(
    guildId,
    services.moduleName ?? ModuleName,
    roleId,
    BlockKey,
  );
}