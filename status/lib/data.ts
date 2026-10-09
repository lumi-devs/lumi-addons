import { get, set } from "lumi/kv";
import {
  StatusStore,
  defaultState,
  type RotationState,
  type StatusEntry,
} from "../keys.js";

export async function getEntries(guildId: string): Promise<StatusEntry[]> {
  return (
    (await get<StatusEntry[]>(
      guildId,
      StatusStore.targetId,
      StatusStore.entries,
    )) ?? []
  );
}

export async function saveEntries(
  guildId: string,
  entries: StatusEntry[],
): Promise<void> {
  await set(guildId, StatusStore.targetId, StatusStore.entries, entries);
}

export async function addEntry(
  guildId: string,
  entry: Omit<StatusEntry, "id">,
): Promise<StatusEntry> {
  const entries = await getEntries(guildId);
  const id = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const full: StatusEntry = { id, ...entry };
  await saveEntries(guildId, [...entries, full]);
  return full;
}

export async function removeEntry(
  guildId: string,
  id: number,
): Promise<boolean> {
  const entries = await getEntries(guildId);
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  await saveEntries(guildId, next);
  return true;
}

export async function getState(
  guildId: string,
  now: number = Date.now(),
): Promise<RotationState> {
  return (
    (await get<RotationState>(
      guildId,
      StatusStore.targetId,
      StatusStore.state,
    )) ?? defaultState(now)
  );
}

export async function saveState(
  guildId: string,
  state: RotationState,
): Promise<void> {
  await set(guildId, StatusStore.targetId, StatusStore.state, state);
}
