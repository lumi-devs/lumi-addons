import type { Container } from "#src/lib/Services.js";
import { makeInfoCard } from "#src/lib/ui/Cards.js";
import type { BoosterConfig } from "./Config.js";
import { BoosterKeys, MODULE_NAME } from "./Keys.js";

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
  reason?: string | undefined;
}

export interface GraceRecord {
  expiresAt: number;
}

export function getRole(
  services: Container,
  guildId: string,
  ownerId: string,
): Promise<BoosterRole | null> {
  return services.db.guildKV.getModuleData<BoosterRole>(
    guildId,
    MODULE_NAME,
    ownerId,
    BoosterKeys.ROLE,
  );
}

export function setRole(
  services: Container,
  guildId: string,
  role: BoosterRole,
): Promise<void> {
  return services.db.guildKV.setModuleData<BoosterRole>(
    guildId,
    MODULE_NAME,
    role.ownerId,
    BoosterKeys.ROLE,
    role,
  );
}

export function deleteRole(
  services: Container,
  guildId: string,
  ownerId: string,
): Promise<number> {
  return services.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    ownerId,
    BoosterKeys.ROLE,
  );
}

export async function listRoles(
  services: Container,
  guildId: string,
): Promise<BoosterRole[]> {
  const rows = await services.db.guildKV.listModuleData<BoosterRole>({
    module: MODULE_NAME,
    key: BoosterKeys.ROLE,
    guildId,
  });
  return rows.map((r) => r.value);
}

export async function addShare(
  services: Container,
  guildId: string,
  ownerId: string,
  targetId: string,
  maxShares: number,
): Promise<{ ok: true; role: BoosterRole } | { ok: false; reason: string }> {
  const role = await getRole(services, guildId, ownerId);
  if (!role) return { ok: false, reason: "You don't have a role." };
  if (targetId === ownerId) return { ok: false, reason: "You already own this role." };
  if (role.sharedWith.includes(targetId)) return { ok: false, reason: "They already have this role." };
  if (role.sharedWith.length >= maxShares) {
    return { ok: false, reason: `You can share with at most ${maxShares} member(s).` };
  }
  role.sharedWith.push(targetId);
  await setRole(services, guildId, role);
  return { ok: true, role };
}

export async function removeShare(
  services: Container,
  guildId: string,
  ownerId: string,
  targetId: string,
): Promise<boolean> {
  const role = await getRole(services, guildId, ownerId);
  if (!role) return false;
  const next = role.sharedWith.filter((id) => id !== targetId);
  if (next.length === role.sharedWith.length) return false;
  role.sharedWith = next;
  await setRole(services, guildId, role);
  return true;
}

export function getGrace(
  services: Container,
  guildId: string,
  ownerId: string,
): Promise<GraceRecord | null> {
  return services.db.guildKV.getModuleData<GraceRecord>(
    guildId,
    MODULE_NAME,
    ownerId,
    BoosterKeys.GRACE,
  );
}

export function setGrace(
  services: Container,
  guildId: string,
  ownerId: string,
  expiresAt: number,
): Promise<void> {
  return services.db.guildKV.setModuleData<GraceRecord>(
    guildId,
    MODULE_NAME,
    ownerId,
    BoosterKeys.GRACE,
    { expiresAt },
  );
}

export function clearGrace(
  services: Container,
  guildId: string,
  ownerId: string,
): Promise<number> {
  return services.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    ownerId,
    BoosterKeys.GRACE,
  );
}

export function isBlacklisted(
  services: Container,
  guildId: string,
  userId: string,
): Promise<boolean> {
  return services.db.guildKV
    .getModuleData<BlacklistRecord>(
      guildId,
      MODULE_NAME,
      userId,
      BoosterKeys.BLACKLIST,
    )
    .then(Boolean);
}

export function addBlacklist(
  services: Container,
  guildId: string,
  userId: string,
  by: string,
  reason?: string,
): Promise<void> {
  return services.db.guildKV.setModuleData<BlacklistRecord>(
    guildId,
    MODULE_NAME,
    userId,
    BoosterKeys.BLACKLIST,
    { at: Date.now(), by, reason },
  );
}

export function removeBlacklist(
  services: Container,
  guildId: string,
  userId: string,
): Promise<number> {
  return services.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    userId,
    BoosterKeys.BLACKLIST,
  );
}

export async function listBlacklist(
  services: Container,
  guildId: string,
): Promise<{ userId: string; record: BlacklistRecord }[]> {
  const rows = await services.db.guildKV.listModuleData<BlacklistRecord>({
    module: MODULE_NAME,
    key: BoosterKeys.BLACKLIST,
    guildId,
  });
  return rows.map((r) => ({ userId: r.targetId, record: r.value }));
}

export async function deleteBoosterRole(
  services: Container,
  guildId: string,
  role: BoosterRole,
  config: BoosterConfig,
  reason: string,
): Promise<void> {
  await deleteRole(services, guildId, role.ownerId);
  await clearGrace(services, guildId, role.ownerId);

  const guild = services.client.guilds.cache.get(guildId) ??
    (await services.client.guilds.fetch(guildId).catch(() => null));
  if (guild) {
    const discordRole =
      guild.roles.cache.get(role.roleId) ??
      (await guild.roles.fetch(role.roleId).catch(() => null));
    if (discordRole) {
      await discordRole.delete(`Booster role cleanup: ${reason}`).catch(() => {});
    }
  }

  if (config.logChannelId) {
    const channel =
      services.client.channels.cache.get(config.logChannelId) ??
      (await services.client.channels.fetch(config.logChannelId).catch(() => null));
    if (channel && channel.isSendable()) {
      await channel
        .send(
          makeInfoCard(
            "🗑️ Booster Role Removed",
            `<@${role.ownerId}>'s custom role **${role.name}** was removed — ${reason}.`,
          ),
        )
        .catch(() => {});
    }
  }
}
