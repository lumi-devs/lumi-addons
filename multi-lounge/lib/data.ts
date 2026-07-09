import { container } from "@sapphire/framework";
import {
  MODULE_NAME,
  MANAGER_SCOPE,
  REGISTRY_KEY,
  STATS_KEY,
  EMPTY_STATS,
  type ExtraLounge,
  type LoungeStats,
} from "../keys.js";

// ── Per-base extra-lounge registry (targetId = base channel id) ──────────────

export async function getExtras(
  guildId: string,
  baseId: string,
): Promise<ExtraLounge[]> {
  const rows = await container.db.guildKV.getModuleData<ExtraLounge[]>(
    guildId,
    MODULE_NAME,
    baseId,
    REGISTRY_KEY,
  );
  return rows ?? [];
}

export async function setExtras(
  guildId: string,
  baseId: string,
  extras: ExtraLounge[],
): Promise<void> {
  await container.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    baseId,
    REGISTRY_KEY,
    extras,
  );
}

/** Base channel ids that currently have a registry row (for stale cleanup). */
export async function listRegisteredBases(guildId: string): Promise<string[]> {
  const rows = await container.db.guildKV.listModuleData<ExtraLounge[]>({
    module: MODULE_NAME,
    key: REGISTRY_KEY,
    guildId,
  });
  return rows.map((r) => r.targetId);
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(guildId: string): Promise<LoungeStats> {
  const stats = await container.db.guildKV.getModuleData<LoungeStats>(
    guildId,
    MODULE_NAME,
    MANAGER_SCOPE,
    STATS_KEY,
  );
  return stats ?? { ...EMPTY_STATS };
}

async function saveStats(guildId: string, stats: LoungeStats): Promise<void> {
  await container.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    MANAGER_SCOPE,
    STATS_KEY,
    stats,
  );
}

export async function recordCreation(guildId: string): Promise<void> {
  const stats = await getStats(guildId);
  stats.creations += 1;
  await saveStats(guildId, stats);
}

export async function recordDeletion(guildId: string): Promise<void> {
  const stats = await getStats(guildId);
  stats.deletions += 1;
  await saveStats(guildId, stats);
}

export async function recordPeak(
  guildId: string,
  concurrentUsers: number,
): Promise<void> {
  const stats = await getStats(guildId);
  if (concurrentUsers > stats.peakUsers) {
    stats.peakUsers = concurrentUsers;
    await saveStats(guildId, stats);
  }
}
