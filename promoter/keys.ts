export const MODULE_NAME = "promoter";

export const PromoterKeys = {
  /** Epoch ms of the last completed sweep for a guild. */
  lastSweep: (guildId: string) => `lumi:addon:promoter:sweep:${guildId}`,
  /** Mutex around the per-guild stats read-modify-write. */
  statsLock: (guildId: string) => `lumi:lock:promoter-stats:${guildId}`,
} as const;

export const PromoterData = {
  META: "meta",
  STATS: "stats",
} as const;

export interface PromoterStats {
  granted: number;
  revoked: number;
}
