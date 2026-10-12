import type { Container } from "@lumi-devs/lumi/services";
import type { ActivityRoleMapping } from "./Matcher.js";

export const MODULE_NAME = "activity-roles";

const MAPPING_KEY = "mapping";
const MEMBER_KEY = "member";

export interface MemberState {
  activities: { name: string; type: number; state: string | null }[];
  granted: string[];
}

type StoredMapping = Omit<ActivityRoleMapping, "id">;

export function mappingId(type: string, match: string): string {
  return `${type.toLowerCase()}:${match.toLowerCase()}`;
}

export async function getMappings(
  services: Container,
  guildId: string,
): Promise<ActivityRoleMapping[]> {
  const rows = await services.db.guildKV.listModuleData<StoredMapping>({
    module: MODULE_NAME,
    key: MAPPING_KEY,
    guildId,
  });
  return rows.map((r) => ({ id: r.targetId, ...r.value }));
}

export async function addMapping(
  services: Container,
  guildId: string,
  type: string,
  match: string,
  roleId: string,
): Promise<void> {
  const id = mappingId(type, match);
  await services.db.guildKV.setModuleData<StoredMapping>(
    guildId,
    MODULE_NAME,
    id,
    MAPPING_KEY,
    { type, match, roleId },
  );
}

export async function removeMapping(
  services: Container,
  guildId: string,
  id: string,
): Promise<boolean> {
  const count = await services.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    id,
    MAPPING_KEY,
  );
  return count > 0;
}

export async function getMemberState(
  services: Container,
  guildId: string,
  userId: string,
): Promise<MemberState | null> {
  return services.db.guildKV.getModuleData<MemberState>(
    guildId,
    MODULE_NAME,
    userId,
    MEMBER_KEY,
  );
}

export async function setMemberState(
  services: Container,
  guildId: string,
  userId: string,
  state: MemberState,
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    userId,
    MEMBER_KEY,
    state,
  );
}

export async function clearMemberState(
  services: Container,
  guildId: string,
  userId: string,
): Promise<void> {
  await services.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    userId,
    MEMBER_KEY,
  );
}

export async function deleteAllUserData(
  services: Container,
  userId: string,
): Promise<void> {
  await services.db.guildKV.deleteModuleDataForTarget(MODULE_NAME, userId);
}
