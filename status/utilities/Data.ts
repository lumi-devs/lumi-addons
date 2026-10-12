import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import {
  MODULE_NAME,
  StatusStore,
  defaultState,
  type RotationState,
  type StatusEntry,
} from "./Keys.js";

export async function getEntries(
  services: Container,
  guildId: string,
): Promise<StatusEntry[]> {
  return (
    (await services.db.guildKV.getModuleData<StatusEntry[]>(
      guildId,
      MODULE_NAME,
      StatusStore.targetId,
      StatusStore.entries,
    )) ?? []
  );
}

export async function saveEntries(
  services: Container,
  guildId: string,
  entries: StatusEntry[],
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    StatusStore.targetId,
    StatusStore.entries,
    entries,
  );
}

export async function addEntry(
  services: Container,
  guildId: string,
  entry: Omit<StatusEntry, "id">,
): Promise<StatusEntry> {
  const entries = await getEntries(services, guildId);
  const id = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const full: StatusEntry = { id, ...entry };
  await saveEntries(services, guildId, [...entries, full]);
  return full;
}

export async function removeEntry(
  services: Container,
  guildId: string,
  id: number,
): Promise<boolean> {
  const entries = await getEntries(services, guildId);
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  await saveEntries(services, guildId, next);
  return true;
}

export async function getState(
  services: Container,
  guildId: string,
  now: number = Date.now(),
): Promise<RotationState> {
  return (
    (await services.db.guildKV.getModuleData<RotationState>(
      guildId,
      MODULE_NAME,
      StatusStore.targetId,
      StatusStore.state,
    )) ?? defaultState(now)
  );
}

export async function saveState(
  services: Container,
  guildId: string,
  state: RotationState,
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    StatusStore.targetId,
    StatusStore.state,
    state,
  );
}
