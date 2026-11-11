import type { ModuleServices } from "@lumi/module-kit";

export const ModuleName = "status";
export const TargetId = "_";
export const EntriesKey = "entries";
export const StateKey = "state";

export const MaxEntries = 25;
export const MinIntervalSeconds = 30;
export const MaxIntervalSeconds = 24 * 60 * 60;
export const DefaultIntervalSeconds = 2 * 60;

export const ActivityKinds = [
  "Playing",
  "Watching",
  "Listening",
  "Competing",
  "Custom",
  "Streaming",
] as const;
export type ActivityKind = (typeof ActivityKinds)[number];

export const PresenceStates = [
  "online",
  "idle",
  "dnd",
  "invisible",
] as const;
export type PresenceState = (typeof PresenceStates)[number];

export interface StatusEntry {
  id: number;
  text: string;
  type: ActivityKind;
  presence: PresenceState;
}

export interface RotationState {
  enabled: boolean;
  intervalSeconds: number;
  cursor: number;
  activatedAt: number;
  nextAt: number;
  lastEntryId: number | null;
}

export function defaultState(): RotationState {
  return {
    enabled: false,
    intervalSeconds: DefaultIntervalSeconds,
    cursor: 0,
    activatedAt: 0,
    nextAt: 0,
    lastEntryId: null,
  };
}

export function nextEntryId(entries: readonly StatusEntry[]): number {
  return entries.reduce((highest, entry) => Math.max(highest, entry.id), 0) + 1;
}

export async function getEntries(
  services: ModuleServices,
  guildId: string,
): Promise<StatusEntry[]> {
  return (
    (await services.helpers.moduleData.get<StatusEntry[]>(
      guildId,
      ModuleName,
      TargetId,
      EntriesKey,
    )) ?? []
  );
}

export async function saveEntries(
  services: ModuleServices,
  guildId: string,
  entries: readonly StatusEntry[],
): Promise<void> {
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    TargetId,
    EntriesKey,
    entries,
  );
}

export async function getState(
  services: ModuleServices,
  guildId: string,
): Promise<RotationState> {
  return (
    (await services.helpers.moduleData.get<RotationState>(
      guildId,
      ModuleName,
      TargetId,
      StateKey,
    )) ?? defaultState()
  );
}

export async function saveState(
  services: ModuleServices,
  guildId: string,
  state: RotationState,
): Promise<void> {
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    TargetId,
    StateKey,
    state,
  );
}