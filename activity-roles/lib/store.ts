import { get, list, remove, set } from "lumi/kv";
import type { PresenceActivity } from "./matcher.js";

export const MODULE_NAME = "activity-roles";

const MAPPING_KEY = "mapping";
const MEMBER_KEY = "member";

export interface ActivityRoleMapping {
  id: string;
  type: string;
  match: string;
  roleId: string;
}

type StoredMapping = Omit<ActivityRoleMapping, "id">;

export interface MemberState {
  activities: PresenceActivity[];
  granted: string[];
}

export function mappingId(type: string, match: string): string {
  return `${type.toLowerCase()}:${match.toLowerCase()}`;
}

export async function getMappings(
  guildId: string,
): Promise<ActivityRoleMapping[]> {
  const rows = await list<StoredMapping>(MAPPING_KEY, guildId);
  return rows.map((r) => ({ id: r.targetId, ...r.value }));
}

export async function addMapping(
  guildId: string,
  type: string,
  match: string,
  roleId: string,
): Promise<void> {
  await set<StoredMapping>(guildId, mappingId(type, match), MAPPING_KEY, {
    type,
    match,
    roleId,
  });
}

export async function removeMapping(
  guildId: string,
  id: string,
): Promise<boolean> {
  const count = await remove(guildId, id, MAPPING_KEY);
  return count > 0;
}

export async function getMemberState(
  guildId: string,
  userId: string,
): Promise<MemberState | null> {
  return (await get<MemberState>(guildId, userId, MEMBER_KEY)) ?? null;
}

export async function setMemberState(
  guildId: string,
  userId: string,
  state: MemberState,
): Promise<void> {
  await set(guildId, userId, MEMBER_KEY, state);
}

export async function clearMemberState(
  guildId: string,
  userId: string,
): Promise<void> {
  await remove(guildId, userId, MEMBER_KEY);
}
