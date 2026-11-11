import type { ModuleServices, TaskDefinition } from "@lumi/module-kit";
import type { Guild } from "discord.js";
import { getConfig, ModuleName, type Config } from "../config.js";
import {
  listRoleRecords,
  setRoleRecord,
  type RoleRecord,
} from "../data.js";
import {
  cleanupRoleRecord,
  deleteBoosterRole,
  fetchMember,
  fetchRole,
  isEligible,
} from "../roles.js";

async function sweepRole(
  services: ModuleServices,
  guild: Guild,
  record: RoleRecord,
  config: Config,
): Promise<void> {
  const role = await fetchRole(guild, record.roleId);
  if (!role) {
    await cleanupRoleRecord(services, guild.id, record);
    return;
  }

  const owner = await fetchMember(guild, record.ownerId);
  if (owner && isEligible(owner, config)) {
    if (record.graceUntil !== null) {
      record.graceUntil = null;
      await setRoleRecord(services, guild.id, record);
    }
    if (!owner.roles.cache.has(role.id)) {
      await owner.roles
        .add(role, "Recovering booster role")
        .catch(() => undefined);
    }
    for (const shareId of record.shares) {
      const friend = await fetchMember(guild, shareId);
      if (friend && !friend.roles.cache.has(role.id)) {
        await friend.roles
          .add(role, "Recovering shared booster role")
          .catch(() => undefined);
      }
    }
    return;
  }

  if (record.graceUntil !== null && record.graceUntil <= Date.now()) {
    await deleteBoosterRole(
      services,
      guild.id,
      record,
      config,
      "grace period expired",
    );
    return;
  }
  if (record.graceUntil !== null) return;

  if (config.graceHours <= 0) {
    await deleteBoosterRole(
      services,
      guild.id,
      record,
      config,
      "the owner no longer qualifies",
    );
    return;
  }

  record.graceUntil = Date.now() + config.graceHours * 3_600_000;
  await setRoleRecord(services, guild.id, record);
}

async function sweepGuild(
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const config = await getConfig(services, guild.id);
  const records = await listRoleRecords(services, guild.id);
  for (const record of records) {
    try {
      await sweepRole(services, guild, record, config);
    } catch (error) {
      services.observability?.logger?.warn?.("booster role sweep failed", {
        guildId: guild.id,
        roleId: record.roleId,
        error,
      });
    }
  }
}

export async function sweepBoosterRoles(
  services: ModuleServices,
): Promise<void> {
  for (const guild of services.client.guilds.cache.values()) {
    if (!services.modules.isEnabled(guild.id, ModuleName)) continue;
    try {
      await sweepGuild(services, guild);
    } catch (error) {
      services.observability?.logger?.warn?.("booster role sweep aborted", {
        guildId: guild.id,
        error,
      });
    }
  }
}

export const sweepTask: TaskDefinition = {
  name: "grace-sweep",
  cron: "*/15 * * * *",
  handler: sweepBoosterRoles,
};
