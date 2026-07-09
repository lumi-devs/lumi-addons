export const MODULE_NAME = "multi-lounge";

/** Guild-wide stats live under this KV scope (targetId). */
export const MANAGER_SCOPE = "manager";
export const STATS_KEY = "stats";
/** Per-base registry rows use the base channel id as their targetId. */
export const REGISTRY_KEY = "extras";

export const LoungeKeys = {
  /** Per-base creation-cadence gate; TTL = configured cooldown seconds. */
  cooldown: (guildId: string, baseId: string) =>
    `lumi:addon:multi-lounge:cooldown:${guildId}:${baseId}`,
} as const;

/** A bot-created extra lounge tracked so restarts never orphan channels. */
export interface ExtraLounge {
  channelId: string;
  number: number;
}

export interface LoungeStats {
  creations: number;
  deletions: number;
  peakUsers: number;
}

export const EMPTY_STATS: LoungeStats = {
  creations: 0,
  deletions: 0,
  peakUsers: 0,
};
