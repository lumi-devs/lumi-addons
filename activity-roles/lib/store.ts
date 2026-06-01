import { container } from "@sapphire/framework";
import { MODULE_NAME } from "./keys.js";

export interface ActivityRoleMapping {
  id: string; // e.g. "type:matchString"
  type: string; // e.g. "Playing", "Listening"
  match: string; // e.g. "Spotify", "League of Legends"
  roleId: string;
}

export async function getMappings(guildId: string): Promise<ActivityRoleMapping[]> {
  // Use listModuleData which returns Map<string, any>
  const data = await container.db.guildKV.listModuleData(guildId, MODULE_NAME, "mappings");
  
  const mappings: ActivityRoleMapping[] = [];
  for (const [key, value] of data.entries()) {
    mappings.push({
      id: key,
      type: value.type,
      match: value.match,
      roleId: value.roleId,
    });
  }
  return mappings;
}

export async function addMapping(
  guildId: string,
  type: string,
  match: string,
  roleId: string
): Promise<void> {
  const id = `${type.toLowerCase()}:${match.toLowerCase()}`;
  await container.db.guildKV.setModuleData(guildId, MODULE_NAME, "mappings", id, {
    type,
    match,
    roleId,
  });
}

export async function removeMapping(guildId: string, id: string): Promise<boolean> {
  // We can't know for sure if it existed before delete using just deleteModuleData, 
  // but we can check if it exists first or just delete it.
  const existing = await container.db.guildKV.getModuleData(guildId, MODULE_NAME, "mappings", id);
  if (!existing) return false;
  
  await container.db.guildKV.deleteModuleData(guildId, MODULE_NAME, "mappings", id);
  return true;
}
