export const MODULE_NAME = "multi-lounge";
export const MANAGER_SCOPE = "manager";
export const STATS_KEY = "stats";
export const REGISTRY_KEY = "extras";
export const RECONCILE_TASK = "multi-lounge-reconcile";
export const RECONCILE_INTERVAL_MS = 60_000;

export interface ExtraLounge {
  channelId: string;
  baseId: string;
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
