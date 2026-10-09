export const StatusStore = {
  targetId: "meta",
  entries: "entries",
  state: "state",
} as const;

export interface StatusEntry {
  id: number;
  text: string;
  type: "Custom" | "Playing" | "Listening" | "Watching" | "Competing";
  presence: "online" | "idle" | "dnd";
  addedBy: string;
  addedAt: number;
}

export interface RotationState {
  queue: number[];
  lastId: number | null;
  nextAtMs: number;
  intervalMs: number;
  enabled: boolean;
  scheduledForMs: number;
}

export const DEFAULT_INTERVAL_MS = 120_000;
export const MIN_INTERVAL_MS = 30_000;

export function defaultState(now: number = Date.now()): RotationState {
  return {
    queue: [],
    lastId: null,
    nextAtMs: now + DEFAULT_INTERVAL_MS,
    intervalMs: DEFAULT_INTERVAL_MS,
    enabled: true,
    scheduledForMs: 0,
  };
}
