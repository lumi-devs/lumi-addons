import type { ModuleServices } from "@lumi/module-kit";
import { withKeyLock } from "@lumi/module-kit";
import { type CardReply, noPingCard } from "@lumi/ui";
import {
  PermissionFlagsBits,
  type Guild,
  type Role,
} from "discord.js";
import { ModuleName } from "./config.js";
import {
  deleteBlock,
  getBlock,
  setBlock,
  type BlockRecord,
} from "./data.js";
import {
  buildBlockCard,
  buildBlockClearedCard,
  buildRestoreCard,
} from "./ui.js";

async function sendLog(
  services: ModuleServices,
  channelId: string | null,
  card: CardReply,
): Promise<void> {
  if (!channelId) return;
  const channel = await services.client.channels
    .fetch(channelId)
    .catch(() => null);
  if (!channel?.isSendable()) return;
  await channel.send(noPingCard(card)).catch(() => undefined);
}

export type RoleCheck =
  | { ok: true; role: Role }
  | { ok: false; reason: string };

export type BlockApplyOutcome =
  | { ok: true; block: BlockRecord }
  | { ok: false; reason: string };

export interface RestoreOutcome {
  ok: boolean;
  roleMissing?: boolean;
  reason?: string;
}

async function resolveRole(guild: Guild, roleId: string): Promise<Role | null> {
  const cached = guild.roles.cache.get(roleId);
  if (cached) return cached;
  return guild.roles.fetch(roleId).catch(() => null);
}

async function checkRole(guild: Guild, role: Role): Promise<RoleCheck> {
  if (role.id === guild.id) {
    return {
      ok: false,
      reason: "The @everyone role cannot be protected or blocked.",
    };
  }
  if (role.managed) {
    return {
      ok: false,
      reason: "That role is managed by an integration and cannot be changed.",
    };
  }
  const bot =
    guild.members.me ??
    (await guild.members.fetchMe().catch(() => null));
  if (!bot) {
    return { ok: false, reason: "I cannot inspect my server member." };
  }
  if (!bot.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      ok: false,
      reason: "I need the **Manage Roles** permission to change that role.",
    };
  }
  if (role.position >= bot.roles.highest.position) {
    return {
      ok: false,
      reason: "That role is above or equal to my highest role.",
    };
  }
  return { ok: true, role };
}

export async function resolveManageableRole(
  guild: Guild,
  roleId: string,
): Promise<RoleCheck> {
  const role = await resolveRole(guild, roleId);
  if (!role) return { ok: false, reason: "That role no longer exists." };
  return checkRole(guild, role);
}

async function restoreBlockLocked(
  services: ModuleServices,
  guild: Guild,
  block: BlockRecord,
  reason: "expired" | "manual",
  logChannelId: string | null,
): Promise<RestoreOutcome> {
  const role = await resolveRole(guild, block.roleId);
  if (!role) {
    await deleteBlock(services, guild.id, block.roleId);
    await sendLog(
      services,
      logChannelId,
      buildBlockClearedCard(block.roleId, block.roleName),
    );
    return { ok: true, roleMissing: true };
  }

  const check = await checkRole(guild, role);
  if (!check.ok) return { ok: false, reason: check.reason };

  try {
    if (role.mentionable !== block.previousMentionable) {
      await role.setMentionable(
        block.previousMentionable,
        `RoleMentions: ${reason} restore`,
      );
    }
  } catch (error) {
    services.observability?.logger?.warn?.("role mention restore failed", {
      guildId: guild.id,
      roleId: block.roleId,
      error,
    });
    return {
      ok: false,
      reason:
        "Discord rejected the role update. Check my role position and **Manage Roles**.",
    };
  }

  await deleteBlock(services, guild.id, block.roleId);
  await sendLog(
    services,
    logChannelId,
    buildRestoreCard({
      roleId: block.roleId,
      roleName: role.name,
      previousMentionable: block.previousMentionable,
      reason,
    }),
  );
  return { ok: true };
}

export async function applyBlock(
  services: ModuleServices,
  guild: Guild,
  roleId: string,
  minutes: number,
  manual: boolean,
  logChannelId: string | null,
): Promise<BlockApplyOutcome> {
  return withKeyLock(services, `${ModuleName}:lock:block:${guild.id}:${roleId}`, async () => {
    const existing = await getBlock(services, guild.id, roleId);
    if (existing) {
      if (existing.expiresAt > Date.now()) {
        return { ok: false, reason: "That role is already mention-blocked." };
      }
      await restoreBlockLocked(
        services,
        guild,
        existing,
        "expired",
        logChannelId,
      );
    }

    const check = await resolveManageableRole(guild, roleId);
    if (!check.ok) return check;
    const role = check.role;
    if (!role.mentionable) {
      return {
        ok: false,
        reason:
          "That role is already non-mentionable, so a temporary block is not needed.",
      };
    }

    const durationMinutes = Math.max(1, Math.trunc(minutes));
    const createdAt = Date.now();
    const expiresAt = createdAt + durationMinutes * 60_000;
    const previousMentionable = role.mentionable;

    try {
      await role.setMentionable(
        false,
        `RoleMentions: ${manual ? "manual" : "automatic"} mention block`,
      );
    } catch (error) {
      services.observability?.logger?.warn?.("role mention block failed", {
        guildId: guild.id,
        roleId,
        error,
      });
      return {
        ok: false,
        reason:
          "Discord rejected the role update. Check my role position and **Manage Roles**.",
      };
    }

    const block: BlockRecord = {
      roleId,
      roleName: role.name,
      expiresAt,
      previousMentionable,
    };

    try {
      await setBlock(services, guild.id, block);
    } catch (error) {
      await role
        .setMentionable(previousMentionable, "RoleMentions: rollback")
        .catch(() => undefined);
      services.observability?.logger?.error?.(
        "role mention block record failed",
        { guildId: guild.id, roleId, error },
      );
      return {
        ok: false,
        reason: "Could not save the block record, so the role was restored.",
      };
    }

    await sendLog(
      services,
      logChannelId,
      buildBlockCard({
        roleId,
        roleName: role.name,
        durationMinutes,
        expiresAt,
        manual,
      }),
    );
    return { ok: true, block };
  });
}

export async function restoreBlock(
  services: ModuleServices,
  guild: Guild,
  block: BlockRecord,
  reason: "expired" | "manual",
  logChannelId: string | null,
): Promise<RestoreOutcome> {
  return withKeyLock(services, `${ModuleName}:lock:block:${guild.id}:${block.roleId}`, () =>
    restoreBlockLocked(services, guild, block, reason, logChannelId),
  );
}

export async function reconcileBlock(
  services: ModuleServices,
  guild: Guild,
  block: BlockRecord,
  logChannelId: string | null,
): Promise<void> {
  await withKeyLock(services, `${ModuleName}:lock:block:${guild.id}:${block.roleId}`, async () => {
    const fresh = await getBlock(services, guild.id, block.roleId);
    if (!fresh) return;

    if (fresh.expiresAt <= Date.now()) {
      await restoreBlockLocked(
        services,
        guild,
        fresh,
        "expired",
        logChannelId,
      );
      return;
    }

    const role = await resolveRole(guild, fresh.roleId);
    if (!role) {
      await deleteBlock(services, guild.id, fresh.roleId);
      await sendLog(
        services,
        logChannelId,
        buildBlockClearedCard(fresh.roleId, fresh.roleName),
      );
      return;
    }

    if (!role.mentionable) return;
    const check = await checkRole(guild, role);
    if (!check.ok) return;

    try {
      await role.setMentionable(
        false,
        "RoleMentions: re-applying active mention block",
      );
      services.observability?.logger?.info?.(
        "role mention block drift healed",
        { guildId: guild.id, roleId: fresh.roleId },
      );
    } catch (error) {
      services.observability?.logger?.warn?.(
        "role mention block drift heal failed",
        { guildId: guild.id, roleId: fresh.roleId, error },
      );
    }
  });
}