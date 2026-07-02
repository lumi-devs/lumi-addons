import { container } from "@sapphire/framework";
import { MODULE_NAME } from "./keys.js";

// KV layout: one row per mapping — targetId = mapping id, key = KV_KEY.
// listModuleData filters by `module + key`, so the varying part must be targetId.
const KV_KEY = "mapping";

export interface ActivityRoleMapping {
  id: string; // e.g. "playing:league of legends"
  type: string; // e.g. "Playing", "Listening"
  match: string; // e.g. "Spotify", "League of Legends"
  roleId: string;
}

type StoredMapping = Omit<ActivityRoleMapping, "id">;

export async function getMappings(
  guildId: string,
): Promise<ActivityRoleMapping[]> {
  const rows = await container.db.guildKV.listModuleData<StoredMapping>({
    module: MODULE_NAME,
    key: KV_KEY,
    guildId,
  });
  return rows.map((r) => ({ id: r.targetId, ...r.value }));
}

export async function addMapping(
  guildId: string,
  type: string,
  match: string,
  roleId: string,
): Promise<void> {
  const id = `${type.toLowerCase()}:${match.toLowerCase()}`;
  await container.db.guildKV.setModuleData<StoredMapping>(
    guildId,
    MODULE_NAME,
    id,
    KV_KEY,
    { type, match, roleId },
  );
}

export async function removeMapping(
  guildId: string,
  id: string,
): Promise<boolean> {
  const count = await container.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    id,
    KV_KEY,
  );
  return count > 0;
}
