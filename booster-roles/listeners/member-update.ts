import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import type { GuildMember, PartialGuildMember } from "discord.js";
import { getConfig, ModuleName } from "../config.js";
import { getRoleById, getRoleByOwner, setRoleRecord } from "../data.js";
import {
  cleanupRoleRecord,
  deleteBoosterRole,
  fetchMember,
  fetchRole,
  isEligible,
  retryPendingRemovals,
  withRoleLock,
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
    const updated = await retryPendingRemovals(services, guild, record).catch(
      () => record,
    );
    await withRoleLock(
      services,
      `role:${guildId}:${updated.roleId}`,
      async () => {
        const fresh = await getRoleById(
          services,
          guildId,
          updated.roleId,
        );
        if (!fresh) {
          await cleanupRoleRecord(services, guildId, updated);
          return;
        }
        const role = await fetchRole(guild, fresh.roleId);
        if (!role) {
          await cleanupRoleRecord(services, guildId, fresh);
          return;
        }

        if (isEligible(newMember, config)) {
          if (fresh.graceUntil !== null) {
            fresh.graceUntil = null;
            await setRoleRecord(services, guildId, fresh);
          }
          if (!newMember.roles.cache.has(role.id)) {
            await newMember.roles
              .add(role, "Re-granting booster role")
              .catch(() => undefined);
          }
          for (const shareId of fresh.shares) {
            const friend = await fetchMember(guild, shareId);
            if (friend && !friend.roles.cache.has(role.id)) {
              await friend.roles
                .add(role, "Re-granting shared booster role")
                .catch(() => undefined);
            }
          }
          return;
        }

        if (fresh.graceUntil !== null) {
          if (fresh.graceUntil <= Date.now()) {
            await deleteBoosterRole(
              services,
              guildId,
              fresh,
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
            fresh,
            config,
            "their boost lapsed",
          );
          return;
        }

        fresh.graceUntil = Date.now() + config.graceHours * 3_600_000;
        await setRoleRecord(services, guildId, fresh);
      },
    );
  },
};

export default memberUpdateListener;
