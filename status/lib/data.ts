import { container } from "@sapphire/framework";
import {
  DEFAULT_SETTINGS,
  GLOBAL_SCOPE,
  MODULE_NAME,
  StatusData,
  type GlobalSettings,
  type StatusEntry,
} from "../keys.js";

export async function getEntries(): Promise<StatusEntry[]> {
  return (
    (await container.db.guildKV.getModuleData<StatusEntry[]>(
      GLOBAL_SCOPE,
      MODULE_NAME,
      StatusData.META,
      StatusData.ENTRIES,
    )) ?? []
  );
}

export async function saveEntries(entries: StatusEntry[]): Promise<void> {
  await container.db.guildKV.setModuleData(
    GLOBAL_SCOPE,
    MODULE_NAME,
    StatusData.META,
    StatusData.ENTRIES,
    entries,
  );
}

export async function addEntry(
  entry: Omit<StatusEntry, "id">,
): Promise<StatusEntry> {
  const entries = await getEntries();
  const id = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const full: StatusEntry = { id, ...entry };
  await saveEntries([...entries, full]);
  return full;
}

/** Returns true when an entry with that id existed and was removed. */
export async function removeEntry(id: number): Promise<boolean> {
  const entries = await getEntries();
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  await saveEntries(next);
  return true;
}

export async function getSettings(): Promise<GlobalSettings> {
  return (
    (await container.db.guildKV.getModuleData<GlobalSettings>(
      GLOBAL_SCOPE,
      MODULE_NAME,
      StatusData.META,
      StatusData.SETTINGS,
    )) ?? DEFAULT_SETTINGS
  );
}

export async function saveSettings(s: GlobalSettings): Promise<void> {
  await container.db.guildKV.setModuleData(
    GLOBAL_SCOPE,
    MODULE_NAME,
    StatusData.META,
    StatusData.SETTINGS,
    s,
  );
}
