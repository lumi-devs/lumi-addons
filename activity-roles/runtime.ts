import type { ModuleServices } from "@lumi/module-kit";
import {
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import { getGranted, listRules, setGranted } from "./data.js";
import { matchRuleRoles, type ActivitySnapshot } from "./logic.js";

const RoleChangeReason = "Activity role matches presence";

interface RoleAvailability {
  ok: boolean;
  reason: string;
  missing: boolean;
}

export function roleAvailability(
  guild: Guild,
  roleId: string,
): RoleAvailability {
  const role = guild.roles.cache.get(roleId);
  if (!role) {
    return {
      ok: false,
      missing: true,
      reason: "That role no longer exists in this server.",
    };
  }
  if (role.id === guild.id) {
    return {
      ok: false,
      missing: false,
      reason: "The @everyone role cannot be assigned.",
    };
  }
  if (role.managed) {
    return {
      ok: false,
      missing: false,
      reason:
        "That role is managed by an integration and cannot be assigned manually.",
    };
  }
  const me = guild.members.me;
  if (!me) {
    return {
      ok: false,
      missing: false,
      reason: "I am not a member of this server.",
    };
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      ok: false,
      missing: false,
      reason: "I need the **Manage Roles** permission to assign roles.",
    };
  }
  if (role.position >= me.roles.highest.position) {
    return {
      ok: false,
      missing: false,
      reason:
        "That role is above my highest role. Move my role above it first.",
    };
  }
  return { ok: true, missing: false, reason: "" };
}

function canManageMember(guild: Guild, member: GuildMember): boolean {
  if (member.user.bot) return false;
  const me = guild.members.me;
  if (!me || member.id === me.id) return false;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
  return member.roles.highest.position < me.roles.highest.position;
}

function logRoleFailure(
  services: ModuleServices,
  guildId: string,
  userId: string,
  roleId: string,
  error: unknown,
): void {
  services.observability.logger.warn("activity role operation failed", {
    guildId,
    userId,
    roleId,
    error: error instanceof Error ? error.message : String(error),
  });
}

export interface ReconcileOutcome {
  matched: string[];
  added: string[];
  removed: string[];
  skipped: string[];
}

const EmptyOutcome: ReconcileOutcome = {
  matched: [],
  added: [],
  removed: [],
  skipped: [],
};

async function reconcileOnce(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  activities: readonly ActivitySnapshot[],
): Promise<ReconcileOutcome> {
  if (member.user.bot) return EmptyOutcome;

  const [rules, grantedBefore] = await Promise.all([
    listRules(services, guild.id),
    getGranted(services, guild.id, member.id),
  ]);
  const matched = matchRuleRoles(activities, rules);
  const desired = new Set(matched);
  const nextGranted = new Set(grantedBefore);
  const added: string[] = [];
  const removed: string[] = [];
  const skipped: string[] = [];
  const manager = canManageMember(guild, member);
  const beforeKey = [...grantedBefore].sort().join(":");
  let persistedKey = beforeKey;

  const persistGranted = async (): Promise<void> => {
    await setGranted(services, guild.id, member.id, [...nextGranted]);
    persistedKey = [...nextGranted].sort().join(":");
  };

  for (const roleId of grantedBefore) {
    if (desired.has(roleId)) continue;
    const availability = roleAvailability(guild, roleId);
    if (availability.missing) {
      nextGranted.delete(roleId);
      continue;
    }
    if (!availability.ok || !manager || !member.roles.cache.has(roleId)) {
      if (!member.roles.cache.has(roleId)) {
        nextGranted.delete(roleId);
      } else {
        skipped.push(roleId);
      }
      continue;
    }
    try {
      await member.roles.remove(
        roleId,
        "Activity role no longer matches presence",
      );
      nextGranted.delete(roleId);
      removed.push(roleId);
    } catch (error) {
      skipped.push(roleId);
      logRoleFailure(services, guild.id, member.id, roleId, error);
    }
  }

  for (const roleId of desired) {
    if (member.roles.cache.has(roleId)) continue;
    const availability = roleAvailability(guild, roleId);
    if (!availability.ok || !manager) {
      skipped.push(roleId);
      continue;
    }
    try {
      nextGranted.add(roleId);
      await persistGranted();
      await member.roles.add(roleId, RoleChangeReason);
      added.push(roleId);
    } catch (error) {
      if (nextGranted.delete(roleId)) {
        await persistGranted().catch(() => undefined);
      }
      skipped.push(roleId);
      logRoleFailure(services, guild.id, member.id, roleId, error);
    }
  }

  const afterKey = [...nextGranted].sort().join(":");
  if (persistedKey !== afterKey) {
    await setGranted(services, guild.id, member.id, [...nextGranted]);
  }

  return { matched, added, removed, skipped };
}

const reconcileQueue = new Map<string, Promise<ReconcileOutcome>>();

export function reconcileMember(
  services: ModuleServices,
  guild: Guild,
  member: GuildMember,
  activities: readonly ActivitySnapshot[],
): Promise<ReconcileOutcome> {
  const key = `${guild.id}:${member.id}`;
  const previous = reconcileQueue.get(key) ?? Promise.resolve();
  const run = previous.then(
    () => reconcileOnce(services, guild, member, activities),
    () => reconcileOnce(services, guild, member, activities),
  );
  const holder: { promise: Promise<ReconcileOutcome> | null } = {
    promise: null,
  };
  const tracked = run.finally(() => {
    if (
      holder.promise !== null &&
      reconcileQueue.get(key) === holder.promise
    ) {
      reconcileQueue.delete(key);
    }
  });
  holder.promise = tracked;
  reconcileQueue.set(key, tracked);
  return tracked;
}
