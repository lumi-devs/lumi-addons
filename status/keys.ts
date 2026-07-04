// Global-scope sentinel: presence is bot-wide, so all KV rows live under this
// pseudo guild. Never pass a real guild id for status data.
export const MODULE_NAME = "status";
export const GLOBAL_SCOPE = "global";

export const StatusData = {
  /** targetId for the entries row and the settings row. */
  META: "meta",
  ENTRIES: "entries",
  SETTINGS: "settings",
} as const;

export const StatusKeys = {
  /** Redis list of entry ids still to play in this shuffle cycle. */
  queue: () => "lumi:addon:status:queue",
  /** Redis string: entry id applied most recently. */
  last: () => "lumi:addon:status:last",
  /** Redis string: epoch ms of the last applied rotation. */
  lastRotatedAt: () => "lumi:addon:status:rotated-at",
} as const;

export interface StatusEntry {
  id: number;
  text: string;
  /** discord.js ActivityType name we support. */
  type: "Custom" | "Playing" | "Listening" | "Watching" | "Competing";
  presence: "online" | "idle" | "dnd";
  addedBy: string;
  addedAt: number;
}

export interface GlobalSettings {
  enabled: boolean;
  intervalMs: number;
}

export const DEFAULT_SETTINGS: GlobalSettings = {
  enabled: true,
  intervalMs: 120_000,
};
