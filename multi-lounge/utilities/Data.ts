import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import {
  EMPTY_STATS,
  MANAGER_SCOPE,
  REGISTRY_KEY,
  STATS_KEY,
  MODULE_NAME,
  type ExtraLounge,
  type LoungeStats,
} from "./Keys.js";

const cooldowns = new Map<string, number>();

export async function getExtras(
  services: Container,
  guildId: string,
  baseId: string,
): Promise<ExtraLounge[]> {
  const data = await services.db.guildKV.getModuleData<ExtraLounge[]>(
    guildId,
    MODULE_NAME,
    baseId,
    REGISTRY_KEY,
  );
  return data ?? [];
}

export async function setExtras(
  services: Container,
  guildId: string,
  baseId: string,
  extras: ExtraLounge[],
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    baseId,
    REGISTRY_KEY,
    extras,
  );
}

export async function listRegisteredBases(
  services: Container,
  guildId: string,
): Promise<string[]> {
  const rows = await services.db.guildKV.listModuleData<ExtraLounge[]>({
    module: MODULE_NAME,
    key: REGISTRY_KEY,
    guildId,
  });
  return rows.map((r) => r.targetId);
}

export async function getStats(
  services: Container,
  guildId: string,
): Promise<LoungeStats> {
  const data = await services.db.guildKV.getModuleData<LoungeStats>(
    guildId,
    MODULE_NAME,
    MANAGER_SCOPE,
    STATS_KEY,
  );
  return data ?? { ...EMPTY_STATS };
}

async function saveStats(
  services: Container,
  guildId: string,
  stats: LoungeStats,
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    MANAGER_SCOPE,
    STATS_KEY,
    stats,
  );
}

export async function recordCreation(
  services: Container,
  guildId: string,
): Promise<void> {
  const stats = await getStats(services, guildId);
  stats.creations += 1;
  await saveStats(services, guildId, stats);
}

export async function recordDeletion(
  services: Container,
  guildId: string,
): Promise<void> {
  const stats = await getStats(services, guildId);
  stats.deletions += 1;
  await saveStats(services, guildId, stats);
}

export async function recordPeak(
  services: Container,
  guildId: string,
  concurrentUsers: number,
): Promise<void> {
  const stats = await getStats(services, guildId);
  if (concurrentUsers > stats.peakUsers) {
    stats.peakUsers = concurrentUsers;
    await saveStats(services, guildId, stats);
  }
}

export function isCoolingDown(
  guildId: string,
  baseId: string,
  cooldownSeconds: number,
): boolean {
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

export function markCooldown(
  guildId: string,
  baseId: string,
  cooldownSeconds: number,
): void {
  if (cooldownSeconds <= 0) return;
  if (cooldowns.size > 200) cooldowns.clear();
  cooldowns.set(`${guildId}:${baseId}`, Date.now());
}
