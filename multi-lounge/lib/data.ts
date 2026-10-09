import { get, list, set } from "lumi/kv";
import {
  EMPTY_STATS,
  MANAGER_SCOPE,
  REGISTRY_KEY,
  STATS_KEY,
  type ExtraLounge,
  type LoungeStats,
} from "../keys.js";

const cooldowns = new Map<string, number>();

export async function getExtras(
  guildId: string,
  baseId: string,
): Promise<ExtraLounge[]> {
  return (await get<ExtraLounge[]>(guildId, baseId, REGISTRY_KEY)) ?? [];
}

export async function setExtras(
  guildId: string,
  baseId: string,
  extras: ExtraLounge[],
): Promise<void> {
  await set(guildId, baseId, REGISTRY_KEY, extras);
}

export async function listRegisteredBases(guildId: string): Promise<string[]> {
  const rows = await list<ExtraLounge[]>(REGISTRY_KEY, guildId);
  return rows.map((r) => r.targetId);
}

export async function getStats(guildId: string): Promise<LoungeStats> {
  return (
    (await get<LoungeStats>(guildId, MANAGER_SCOPE, STATS_KEY)) ?? {
      ...EMPTY_STATS,
    }
  );
}

async function saveStats(guildId: string, stats: LoungeStats): Promise<void> {
  await set(guildId, MANAGER_SCOPE, STATS_KEY, stats);
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

export async function isCoolingDown(
  guildId: string,
  baseId: string,
  cooldownSeconds: number,
): Promise<boolean> {
  if (cooldownSeconds <= 0) return false;
  const key = `${guildId}:${baseId}`;
  const last = cooldowns.get(key);
  if (!last) return false;
  if (Date.now() - last >= cooldownSeconds * 1000) {
    cooldowns.delete(key);
    return false;
  }
  return true;
}

export async function markCooldown(
  guildId: string,
  baseId: string,
  cooldownSeconds: number,
): Promise<void> {
  if (cooldownSeconds <= 0) return;
  if (cooldowns.size > 200) cooldowns.clear();
  cooldowns.set(`${guildId}:${baseId}`, Date.now());
}
