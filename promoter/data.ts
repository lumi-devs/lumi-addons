import type { ModuleServices } from "@lumi/module-kit";
import type { UserPrimaryGuild } from "discord.js";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

export const ModuleName = "promoter";
export const ConfigKey = "promoter-config";

const StringListSchema = z
  .preprocess((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      return value
        .split(/[\n,]+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    }
    return value;
  }, z.array(z.string()))
  .default([]);

export const ConfigSchema = z.object({
  promoterRoleId: z.string().nullable().default(null),
  matchTerms: StringListSchema,
  detectServerTag: z.boolean().default(true),
  logChannelId: z.string().nullable().default(null),
  sweepIntervalMinutes: z.number().int().min(1).max(1440).default(10),
});

export type PromoterConfig = z.infer<typeof ConfigSchema>;

export interface GrantedRecord {
  grantedAt: string;
  reason: string;
}

export interface PromoterStats {
  grants: number;
  revokes: number;
}

const ConfigTtlMs = 15_000;
const GrantedKey = "granted";
const StatsKey = "stats";
const StatsTarget = "_";

export async function getConfig(
  services: ModuleServices,
  guildId: string,
): Promise<PromoterConfig> {
  const cacheKey = `${ModuleName}:config:${guildId}`;
  const cached = await services.helpers.cache
    .get<PromoterConfig>(cacheKey)
    .catch(() => null);
  if (cached) {
    const parsed = ConfigSchema.safeParse(cached);
    if (parsed.success) return parsed.data;
  }

  let stored: unknown = null;
  try {
    stored = await services.moduleConfig.read(
      guildId,
      services.moduleName ?? ModuleName,
      ConfigKey,
    );
  } catch (error) {
    services.observability.logger.warn("promoter config read failed", {
      guildId,
      error,
    });
  }

  const parsed = ConfigSchema.safeParse(stored ?? {});
  if (!parsed.success) {
    services.observability.logger.warn(
      "promoter config invalid, using defaults",
      { guildId, issues: parsed.error.issues },
    );
  }
  const config = parsed.success ? parsed.data : ConfigSchema.parse({});
  await services.helpers.cache.set(cacheKey, config, ConfigTtlMs).catch(() => {
    return;
  });
  return config;
}

export function statusMatches(
  statusText: string,
  terms: readonly string[],
): boolean {
  if (!statusText) return false;
  const haystack = statusText.toLowerCase();
  return terms.some((term) => {
    const needle = term.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

export function wearsServerTag(
  primaryGuild: UserPrimaryGuild | null | undefined,
  guildId: string,
): boolean {
  return Boolean(
    primaryGuild?.identityEnabled &&
      primaryGuild.identityGuildId === guildId,
  );
}

export function describeSignals(statusMatched: boolean, tagMatched: boolean): string {
  const signals: string[] = [];
  if (statusMatched) signals.push("custom status");
  if (tagMatched) signals.push("server tag");
  return signals.length > 0 ? signals.join(" + ") : "promotion";
}

export function getGranted(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<GrantedRecord | null> {
  return services.helpers.moduleData.get<GrantedRecord>(
    guildId,
    ModuleName,
    userId,
    GrantedKey,
  );
}

export function setGranted(
  services: ModuleServices,
  guildId: string,
  userId: string,
  record: GrantedRecord,
): Promise<void> {
  return services.helpers.moduleData.set(
    guildId,
    ModuleName,
    userId,
    GrantedKey,
    record,
  );
}

export function clearGranted(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  return services.helpers.moduleData.delete(
    guildId,
    ModuleName,
    userId,
    GrantedKey,
  );
}

export async function getStats(
  services: ModuleServices,
  guildId: string,
): Promise<PromoterStats> {
  const stored = await services.helpers.moduleData.get<Partial<PromoterStats>>(
    guildId,
    ModuleName,
    StatsTarget,
    StatsKey,
  );
  return {
    grants: typeof stored?.grants === "number" ? stored.grants : 0,
    revokes: typeof stored?.revokes === "number" ? stored.revokes : 0,
  };
}

export async function bumpStats(
  services: ModuleServices,
  guildId: string,
  field: keyof PromoterStats,
): Promise<void> {
  const increment = async (): Promise<void> => {
    const stats = await getStats(services, guildId);
    stats[field] += 1;
    await services.helpers.moduleData.set(
      guildId,
      ModuleName,
      StatsTarget,
      StatsKey,
      stats,
    );
  };

  if (!services.helpers.cache.distributed) {
    await increment();
    return;
  }

  const lockKey = `${ModuleName}:stats-lock:${guildId}`;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const release = await services.helpers.cache
      .takeLock(lockKey, 5_000)
      .catch(() => null);
    if (!release) {
      await delay(20);
      continue;
    }
    try {
      await increment();
    } finally {
      await release().catch(() => {
        return;
      });
    }
    return;
  }
  await increment();
}
