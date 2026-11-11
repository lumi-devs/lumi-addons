import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import type { GuildMember, PartialGuildMember } from "discord.js";
import { getConfig, ModuleName } from "../config.js";
import { getRoleByOwner, setRoleRecord } from "../data.js";
import {
  cleanupRoleRecord,
  deleteBoosterRole,
  fetchMember,
  fetchRole,
  isEligible,
} from "../roles.js";

const memberUpdateListener: ListenerDefinition = {
  event: "guildMemberUpdate",
  async handler(
    _oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
    services: ModuleServices,
  ) {
    const guild = newMember.guild;
    const guildId = guild.id;
    if (!services.modules.isEnabled(guildId, ModuleName)) return;

    const record = await getRoleByOwner(services, guildId, newMember.id);
    if (!record) return;

    const config = await getConfig(services, guildId);
    const role = await fetchRole(guild, record.roleId);
    if (!role) {
      await cleanupRoleRecord(services, guildId, record);
      return;
    }

    if (isEligible(newMember, config)) {
      if (record.graceUntil !== null) {
        record.graceUntil = null;
        await setRoleRecord(services, guildId, record);
      }
      if (!newMember.roles.cache.has(role.id)) {
        await newMember.roles
          .add(role, "Re-granting booster role")
          .catch(() => undefined);
      }
      for (const shareId of record.shares) {
        const friend = await fetchMember(guild, shareId);
        if (friend && !friend.roles.cache.has(role.id)) {
          await friend.roles
            .add(role, "Re-granting shared booster role")
            .catch(() => undefined);
        }
      }
      return;
    }

    if (record.graceUntil !== null) {
      if (record.graceUntil <= Date.now()) {
        await deleteBoosterRole(
          services,
          guildId,
          record,
          config,
          "grace period expired",
        );
      }
      return;
    }

    if (config.graceHours <= 0) {
      await deleteBoosterRole(
        services,
        guildId,
        record,
        config,
        "their boost lapsed",
      );
      return;
    }

    record.graceUntil = Date.now() + config.graceHours * 3_600_000;
    await setRoleRecord(services, guildId, record);
  },
};

export default memberUpdateListener;
