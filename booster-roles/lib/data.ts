import { get, list, remove, set } from "lumi/kv";
import { channels, roles } from "lumi/discord";
import { makeInfoCard } from "lumi/ui";
import type { BoosterConfig } from "./config.js";

export interface BoosterRole {
  ownerId: string;
  roleId: string;
  name: string;
  color: string | null;
  icon: string | null;
  sharedWith: string[];
}

export type RoleRecord = BoosterRole;

export interface BlacklistRecord {
  at: number;
  by: string;
  reason?: string;
}

export interface GraceRecord {
  expiresAt: number;
}

const ROLE_KEY = "role";
const BLACKLIST_KEY = "blacklist";
const GRACE_KEY = "grace";

export function getRole(guildId: string, ownerId: string): Promise<BoosterRole | null> {
  return get<BoosterRole>(guildId, ownerId, ROLE_KEY);
}

export function setRole(guildId: string, role: BoosterRole): Promise<void> {
  return set<BoosterRole>(guildId, role.ownerId, ROLE_KEY, role);
}

export function deleteRole(guildId: string, ownerId: string): Promise<number> {
  return remove(guildId, ownerId, ROLE_KEY);
}

export async function listRoles(guildId: string): Promise<BoosterRole[]> {
  const rows = await list<BoosterRole>(ROLE_KEY, guildId);
  return rows.map((r) => r.value);
}

export async function addShare(
  guildId: string,
  ownerId: string,
  targetId: string,
  maxShares: number,
): Promise<{ ok: true; role: BoosterRole } | { ok: false; reason: string }> {
  const role = await getRole(guildId, ownerId);
  if (!role) return { ok: false, reason: "You don't have a role." };
  if (targetId === ownerId) return { ok: false, reason: "You already own this role." };
  if (role.sharedWith.includes(targetId)) return { ok: false, reason: "They already have this role." };
  if (role.sharedWith.length >= maxShares) {
    return { ok: false, reason: `You can share with at most ${maxShares} member(s).` };
  }
  role.sharedWith.push(targetId);
  await setRole(guildId, role);
  return { ok: true, role };
}

export async function removeShare(
  guildId: string,
  ownerId: string,
  targetId: string,
): Promise<boolean> {
  const role = await getRole(guildId, ownerId);
  if (!role) return false;
  const next = role.sharedWith.filter((id) => id !== targetId);
  if (next.length === role.sharedWith.length) return false;
  role.sharedWith = next;
  await setRole(guildId, role);
  return true;
}

export function getGrace(guildId: string, ownerId: string): Promise<GraceRecord | null> {
  return get<GraceRecord>(guildId, ownerId, GRACE_KEY);
}

export function setGrace(guildId: string, ownerId: string, expiresAt: number): Promise<void> {
  return set<GraceRecord>(guildId, ownerId, GRACE_KEY, { expiresAt });
}

export function clearGrace(guildId: string, ownerId: string): Promise<number> {
  return remove(guildId, ownerId, GRACE_KEY);
}

export function isBlacklisted(guildId: string, userId: string): Promise<boolean> {
  return get<BlacklistRecord>(guildId, userId, BLACKLIST_KEY).then(Boolean);
}

export function addBlacklist(guildId: string, userId: string, by: string, reason?: string): Promise<void> {
  return set<BlacklistRecord>(guildId, userId, BLACKLIST_KEY, { at: Date.now(), by, reason });
}

export function removeBlacklist(guildId: string, userId: string): Promise<number> {
  return remove(guildId, userId, BLACKLIST_KEY);
}

export async function listBlacklist(guildId: string): Promise<{ userId: string; record: BlacklistRecord }[]> {
  const rows = await list<BlacklistRecord>(BLACKLIST_KEY, guildId);
  return rows.map((r) => ({ userId: r.targetId, record: r.value }));
}

export async function deleteBoosterRole(
  guildId: string,
  role: BoosterRole,
  config: BoosterConfig,
  reason: string,
): Promise<void> {
  await deleteRole(guildId, role.ownerId);
  await clearGrace(guildId, role.ownerId);
  await roles.remove(guildId, role.roleId, `Booster role cleanup: ${reason}`).catch(() => {});
  if (config.logChannelId) {
    await channels
      .send(
        config.logChannelId,
        makeInfoCard(
          "🗑️ Booster Role Removed",
          `<@${role.ownerId}>'s custom role **${role.name}** was removed — ${reason}.`,
        ),
      )
      .catch(() => {});
  }
}
