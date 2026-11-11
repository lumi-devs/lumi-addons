import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  makeInfoCard,
  noPingCard,
} from "@lumi/ui";
import {
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  type Role,
} from "discord.js";
import type { Config } from "./config.js";
import {
  addOwnedRole,
  addSharedRole,
  deleteRoleRecord,
  getRoleById,
  getRoleByOwner,
  getUserRoleIndex,
  isBlacklisted,
  listRoleRecords,
  removeOwnedRole,
  removeSharedRole,
  setRoleRecord,
  type RoleRecord,
} from "./data.js";

const ReservedNames: Record<string, true> = { everyone: true, here: true };
const LocalLocks = new Map<string, Promise<void>>();

async function withLocalLock<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = LocalLocks.get(key) ?? Promise.resolve();
  const { promise: current, resolve: release } =
    Promise.withResolvers<void>();
  const tail = previous.then(() => current);
  LocalLocks.set(key, tail);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (LocalLocks.get(key) === tail) LocalLocks.delete(key);
  }
}

async function withRoleLock<T>(
  services: ModuleServices,
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockKey = `booster-roles:lock:${key}`;
  return withLocalLock(lockKey, async () => {
    if (!services.helpers.cache.distributed) return task();
    const deadline = Date.now() + 5_000;
    let release: (() => Promise<void>) | null = null;
    while (!release && Date.now() < deadline) {
      release = await services.helpers.cache
        .takeLock(lockKey, 30_000)
        .catch(() => null);
      if (!release) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try {
      return await task();
    } finally {
      if (release) await release().catch(() => undefined);
    }
  });
}

export type NameValidation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

export type CreateRoleResult =
  | { ok: true; record: RoleRecord; role: Role }
  | { ok: false; reason: string };

export type ShareResult =
  | { ok: true; record: RoleRecord }
  | { ok: false; reason: string };

export type RemoveShareResult =
  | { ok: true; removed: boolean }
  | { ok: false; reason: string };

export function validateRoleName(
  raw: string,
  maxLength: number,
): NameValidation {
  const value = raw
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length === 0) {
    return { ok: false, reason: "The role name can't be empty." };
  }
  if (value.length > maxLength) {
    return {
      ok: false,
      reason: `The role name must be ${maxLength} characters or fewer.`,
    };
  }
  const normalized = value.replace(/^@+/, "").toLowerCase();
  if (ReservedNames[normalized] === true) {
    return { ok: false, reason: "That name is reserved by Discord." };
  }
  return { ok: true, value };
}

export function parseHexColor(raw: string): number | null {
  let hex = raw.trim().toLowerCase();
  if (hex.startsWith("#")) hex = hex.slice(1);
  else if (hex.startsWith("0x")) hex = hex.slice(2);

  if (/^[0-9a-f]{3}$/.test(hex)) {
    hex = hex
      .split("")
      .map((character) => character + character)
      .join("");
  }
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

export function colorToHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
}

export function isEligible(member: GuildMember, config: Config): boolean {
  if (member.premiumSinceTimestamp !== null) return true;
  if (config.qualifyingRoleIds.length === 0) return false;
  return config.qualifyingRoleIds.some((roleId) =>
    member.roles.cache.has(roleId),
  );
}

export async function resolveGuild(
  services: ModuleServices,
  guildId: string,
): Promise<Guild | null> {
  const cached = services.client.guilds.cache.get(guildId);
  if (cached) return cached;
  return services.client.guilds.fetch(guildId).catch(() => null);
}

export async function fetchMember(
  guild: Guild,
  userId: string,
): Promise<GuildMember | null> {
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  return guild.members.fetch(userId).catch(() => null);
}

export async function fetchRole(
  guild: Guild,
  roleId: string,
): Promise<Role | null> {
  const cached = guild.roles.cache.get(roleId);
  if (cached) return cached;
  return guild.roles.fetch(roleId).catch(() => null);
}

export function protectedRoleReason(guild: Guild, role: Role): string | null {
  if (role.id === guild.id) return "Discord's @everyone role can't be managed.";
  if (role.managed) return "Managed roles can't be managed.";
  return null;
}

export async function botRoleGuard(
  guild: Guild,
  target: Role,
): Promise<string | null> {
  const me =
    guild.members.me ??
    (await guild.members.fetchMe().catch(() => null));
  if (!me) return "I couldn't resolve my own server member.";
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return "I need the **Manage Roles** permission to do that.";
  }
  if (me.roles.highest.position <= target.position) {
    return `My highest role must be above **${target.name}**.`;
  }
  return null;
}

export async function cleanupRoleRecord(
  services: ModuleServices,
  guildId: string,
  record: RoleRecord,
): Promise<void> {
  await deleteRoleRecord(services, guildId, record);
  await removeOwnedRole(services, guildId, record.ownerId, record.roleId);
  for (const shareId of record.shares) {
    await removeSharedRole(services, guildId, shareId, record.roleId);
  }
}

export async function loadOwnedRole(
  services: ModuleServices,
  guildId: string,
  ownerId: string,
): Promise<{ record: RoleRecord; role: Role } | null> {
  const record = await getRoleByOwner(services, guildId, ownerId);
  if (!record) return null;

  const guild = await resolveGuild(services, guildId);
  if (!guild) return null;

  const role = await fetchRole(guild, record.roleId);
  if (!role) {
    await cleanupRoleRecord(services, guildId, record);
    return null;
  }
  return { record, role };
}

export async function loadRoleById(
  services: ModuleServices,
  guildId: string,
  roleId: string,
): Promise<{ record: RoleRecord; role: Role } | null> {
  const record = await getRoleById(services, guildId, roleId);
  if (!record) return null;

  const guild = await resolveGuild(services, guildId);
  if (!guild) return null;

  const role = await fetchRole(guild, roleId);
  if (!role) {
    await cleanupRoleRecord(services, guildId, record);
    return null;
  }
  return { record, role };
}

export async function loadSharedRoles(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<{ record: RoleRecord; role: Role }[]> {
  const index = await getUserRoleIndex(services, guildId, userId);
  if (index.shared.length === 0) return [];

  const guild = await resolveGuild(services, guildId);
  if (!guild) return [];

  const results: { record: RoleRecord; role: Role }[] = [];
  for (const roleId of index.shared) {
    const record = await getRoleById(services, guildId, roleId);
    if (!record?.shares.includes(userId)) {
      await removeSharedRole(services, guildId, userId, roleId);
      continue;
    }
    const role = await fetchRole(guild, roleId);
    if (!role) {
      await cleanupRoleRecord(services, guildId, record);
      continue;
    }
    results.push({ record, role });
  }
  return results;
}

export async function createBoosterRole(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  rawName: string,
  config: Config,
): Promise<CreateRoleResult> {
  return withRoleLock(
    services,
    `create:${guild.id}:${member.id}`,
    () => createBoosterRoleUnlocked(services, guild, member, rawName, config),
  );
}

async function createBoosterRoleUnlocked(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  rawName: string,
  config: Config,
): Promise<CreateRoleResult> {
  const name = validateRoleName(rawName, config.maxNameLength);
  if (!name.ok) return { ok: false, reason: name.reason };

  if (await isBlacklisted(services, guild.id, member.id)) {
    return {
      ok: false,
      reason: "You're blacklisted from using custom roles here.",
    };
  }

  if (!config.anchorRoleId) {
    return {
      ok: false,
      reason: "No anchor role is configured. Ask an administrator to set one.",
    };
  }
  const anchor = await fetchRole(guild, config.anchorRoleId);
  if (!anchor || anchor.id === guild.id) {
    return {
      ok: false,
      reason: "The configured anchor role no longer exists.",
    };
  }
  const guard = await botRoleGuard(guild, anchor);
  if (guard) return { ok: false, reason: guard };

  if (await getRoleByOwner(services, guild.id, member.id)) {
    return { ok: false, reason: "You already have a custom role." };
  }

  const created = await guild.roles
    .create({
      name: name.value,
      reason: `Booster custom role for ${member.id}`,
      mentionable: false,
      hoist: false,
      permissions: [],
    })
    .catch(() => null);
  if (!created) {
    return {
      ok: false,
      reason: "I couldn't create the role. Check Manage Roles and role hierarchy.",
    };
  }

  const positioned = await created
    .setPosition(Math.max(1, anchor.position), {
      reason: "Positioning booster role below the anchor",
    })
    .then(() => true)
    .catch(() => false);
  if (!positioned) {
    await created.delete("Booster role positioning failed").catch(() => undefined);
    return {
      ok: false,
      reason: "I couldn't position the role. Check Manage Roles and role hierarchy.",
    };
  }

  const assigned = await member.roles
    .add(created, "Assigning created booster role")
    .then(() => true)
    .catch(() => false);
  if (!assigned) {
    await created.delete("Booster role assignment failed").catch(() => undefined);
    return {
      ok: false,
      reason: "I couldn't assign the role to you. Check role hierarchy.",
    };
  }

  const record: RoleRecord = {
    roleId: created.id,
    ownerId: member.id,
    shares: [],
    createdAt: Date.now(),
    graceUntil: null,
  };
  try {
    await setRoleRecord(services, guild.id, record);
  } catch {
    await created.delete("Booster role data write failed").catch(() => undefined);
    return {
      ok: false,
      reason: "I couldn't save the new role. Try again in a moment.",
    };
  }
  try {
    await addOwnedRole(services, guild.id, member.id, created.id);
  } catch {
    await deleteRoleRecord(services, guild.id, record).catch(() => undefined);
    await created.delete("Booster role index write failed").catch(() => undefined);
    return {
      ok: false,
      reason: "I couldn't save the new role. Try again in a moment.",
    };
  }
  return { ok: true, record, role: created };
}

export async function renameBoosterRole(
  guild: Guild,
  role: Role,
  rawName: string,
  config: Config,
): Promise<string | null> {
  const name = validateRoleName(rawName, config.maxNameLength);
  if (!name.ok) return name.reason;

  const protection = protectedRoleReason(guild, role);
  if (protection) return protection;

  const guard = await botRoleGuard(guild, role);
  if (guard) return guard;

  const edited = await role
    .edit({ name: name.value, reason: "Booster role rename" })
    .then(() => true)
    .catch(() => false);
  return edited ? null : "I couldn't rename the role.";
}

export async function recolorBoosterRole(
  guild: Guild,
  role: Role,
  rawColor: string,
): Promise<string | null> {
  const color = parseHexColor(rawColor);
  if (color === null) {
    return "That's not a valid hex colour. Try something like `#5865F2`.";
  }

  const protection = protectedRoleReason(guild, role);
  if (protection) return protection;

  const guard = await botRoleGuard(guild, role);
  if (guard) return guard;

  const edited = await role
    .edit({
      color,
      reason: `Booster role recolour to ${colorToHex(color)}`,
    })
    .then(() => true)
    .catch(() => false);
  return edited ? null : "I couldn't recolour the role.";
}

export async function shareRoleWithMember(
  services: ModuleServices,
  guild: Guild,
  record: RoleRecord,
  role: Role,
  targetId: string,
  config: Config,
): Promise<ShareResult> {
  if (targetId === record.ownerId) {
    return { ok: false, reason: "You already own this role." };
  }
  if (record.shares.includes(targetId)) {
    return { ok: false, reason: "That member already has your role." };
  }
  if (record.shares.length >= config.maxShares) {
    return {
      ok: false,
      reason: `You can share with at most ${config.maxShares} member(s).`,
    };
  }
  if (await isBlacklisted(services, guild.id, targetId)) {
    return { ok: false, reason: "That member is blocked from custom roles." };
  }

  const target = await fetchMember(guild, targetId);
  if (!target) {
    return { ok: false, reason: "That member is not in this server." };
  }

  const guard = await botRoleGuard(guild, role);
  if (guard) return { ok: false, reason: guard };

  const assigned = await target.roles
    .add(role, "Shared booster role")
    .then(() => true)
    .catch(() => false);
  if (!assigned) {
    return {
      ok: false,
      reason: "I couldn't assign the role to that member. Check role hierarchy.",
    };
  }

  record.shares = [...new Set([...record.shares, targetId])];
  try {
    await setRoleRecord(services, guild.id, record);
  } catch {
    record.shares = record.shares.filter((id) => id !== targetId);
    await target.roles
      .remove(role, "Rolling back failed share")
      .catch(() => undefined);
    return { ok: false, reason: "I couldn't save the share. Try again." };
  }
  try {
    await addSharedRole(services, guild.id, targetId, record.roleId);
  } catch {
    record.shares = record.shares.filter((id) => id !== targetId);
    await setRoleRecord(services, guild.id, record).catch(() => undefined);
    await target.roles
      .remove(role, "Rolling back failed share index")
      .catch(() => undefined);
    return { ok: false, reason: "I couldn't save the share. Try again." };
  }
  return { ok: true, record };
}

export async function removeShareFromRole(
  services: ModuleServices,
  guildId: string,
  record: RoleRecord,
  targetId: string,
  role: Role | null,
  options: { force?: boolean } = {},
): Promise<RemoveShareResult> {
  if (!record.shares.includes(targetId)) {
    return { ok: true, removed: false };
  }

  if (role) {
    const guild = await resolveGuild(services, guildId);
    const target = guild ? await fetchMember(guild, targetId) : null;
    if (target?.roles.cache.has(role.id)) {
      const removed = await target.roles
        .remove(role, "Booster role unshared")
        .then(() => true)
        .catch(() => false);
      if (!removed && options.force !== true) {
        return {
          ok: false,
          reason: "I couldn't remove the role from that member. Check role hierarchy.",
        };
      }
    }
  }

  record.shares = record.shares.filter((id) => id !== targetId);
  await setRoleRecord(services, guildId, record);
  await removeSharedRole(services, guildId, targetId, record.roleId);
  return { ok: true, removed: true };
}

export async function removeUserFromShares(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  const records = await listRoleRecords(services, guildId);
  const guild = await resolveGuild(services, guildId);
  let removed = 0;
  for (const record of records) {
    if (!record.shares.includes(userId)) continue;
    const role = guild ? await fetchRole(guild, record.roleId) : null;
    const result = await removeShareFromRole(
      services,
      guildId,
      record,
      userId,
      role,
      { force: true },
    );
    if (result.ok && result.removed) removed += 1;
  }
  return removed;
}

async function stripRoleFromHolders(
  guild: Guild,
  roleId: string,
  record: RoleRecord,
): Promise<void> {
  const members =
    guild.members.cache.size >= guild.memberCount
      ? guild.members.cache
      : await guild.members.fetch().catch(() => guild.members.cache);
  const memberIds = new Set([record.ownerId, ...record.shares]);
  for (const member of members.values()) {
    if (member.roles.cache.has(roleId)) memberIds.add(member.id);
  }
  for (const memberId of memberIds) {
    const member = await fetchMember(guild, memberId);
    if (member?.roles.cache.has(roleId)) {
      await member.roles
        .remove(roleId, "Booster role cleanup")
        .catch(() => undefined);
    }
  }
}

async function logRoleRemoval(
  services: ModuleServices,
  config: Config,
  record: RoleRecord,
  roleName: string,
  reason: string,
): Promise<void> {
  if (!config.logChannelId) return;
  const channel = await services.client.channels
    .fetch(config.logChannelId)
    .catch(() => null);
  if (!channel?.isSendable()) return;

  const card = noPingCard(
    makeInfoCard("🗑️ Booster Role Removed", [
      `**Owner** <@${record.ownerId}>`,
      `**Role** ${roleName}`,
      `**Reason** ${reason}`,
    ]),
  );
  await channel.send(cardCreateOptions(card)).catch(() => undefined);
}

export async function deleteBoosterRole(
  services: ModuleServices,
  guildId: string,
  record: RoleRecord,
  config: Config,
  reason: string,
): Promise<boolean> {
  const guild = await resolveGuild(services, guildId);
  let roleName = "custom role";
  let deleted = false;
  if (guild) {
    const role = await fetchRole(guild, record.roleId);
    if (role) {
      roleName = role.name;
      const protection = protectedRoleReason(guild, role);
      if (!protection) {
        const guard = await botRoleGuard(guild, role);
        deleted =
          guard === null &&
          (await role
            .delete(`Booster role cleanup: ${reason}`)
            .then(() => true)
            .catch(() => false));
        if (!deleted) await stripRoleFromHolders(guild, role.id, record);
      }
    } else {
      deleted = true;
    }
  }

  await cleanupRoleRecord(services, guildId, record);
  await logRoleRemoval(services, config, record, roleName, reason);
  return deleted;
}

export async function purgeUserRoles(
  services: ModuleServices,
  guildId: string,
  userId: string,
  config: Config,
): Promise<{ roles: number; shares: number }> {
  const index = await getUserRoleIndex(services, guildId, userId);
  let roles = 0;
  let shares = 0;

  for (const roleId of index.owned) {
    const record = await getRoleById(services, guildId, roleId);
    if (!record) {
      await removeOwnedRole(services, guildId, userId, roleId);
      continue;
    }
    await deleteBoosterRole(
      services,
      guildId,
      record,
      config,
      "user data deletion request",
    );
    roles += 1;
  }

  for (const roleId of index.shared) {
    const record = await getRoleById(services, guildId, roleId);
    if (!record) {
      await removeSharedRole(services, guildId, userId, roleId);
      continue;
    }
    const guild = await resolveGuild(services, guildId);
    const role = guild ? await fetchRole(guild, roleId) : null;
    const result = await removeShareFromRole(
      services,
      guildId,
      record,
      userId,
      role,
      { force: true },
    );
    if (result.ok && result.removed) shares += 1;
  }

  return { roles, shares };
}
