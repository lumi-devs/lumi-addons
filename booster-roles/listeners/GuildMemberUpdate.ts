import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import { scheduleOneshot } from "#src/lib/scheduler/Oneshot.js";
import { getBoosterConfig } from "../utilities/Config.js";
import {
  clearGrace,
  deleteBoosterRole,
  getGrace,
  getRole,
  setGrace,
} from "../utilities/Data.js";
import { isEligible } from "../utilities/Access.js";
import { BoosterOneshots, MODULE_NAME } from "../utilities/Keys.js";

export const boosterMemberUpdateListener = defineListener({
  name: "boosterMemberUpdate",
  event: Events.GuildMemberUpdate,
  module: MODULE_NAME,
  guildId: (_old: GuildMember | PartialGuildMember, newMember: GuildMember) =>
    newMember.guild.id,
  async execute(
    services: Container,
    _oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    const guildId = newMember.guild.id;
    const userId = newMember.id;

    const role = await getRole(services, guildId, userId);
    if (!role) return;

    const config = await getBoosterConfig(services, guildId);
    const roleIds = newMember.roles.cache.map((r) => r.id);
    const premiumSince = newMember.premiumSinceTimestamp;

    if (isEligible(roleIds, premiumSince, config)) {
      await clearGrace(services, guildId, userId);
      if (!newMember.roles.cache.has(role.roleId)) {
        await newMember.roles.add(role.roleId, "Re-granting booster role").catch(() => {});
      }
      for (const friendId of role.sharedWith) {
        const friend = await newMember.guild.members.fetch(friendId).catch(() => null);
        if (friend && !friend.roles.cache.has(role.roleId)) {
          await friend.roles.add(role.roleId, "Re-granting shared booster role").catch(() => {});
        }
      }
      return;
    }

    if (config.graceHours <= 0) {
      await deleteBoosterRole(services, guildId, role, config, "their boost lapsed");
      return;
    }

    const existingGrace = await getGrace(services, guildId, userId);
    if (existingGrace) return;

    const delayMs = config.graceHours * 3_600_000;
    const expiresAt = Date.now() + delayMs;
    await setGrace(services, guildId, userId, expiresAt);
    await scheduleOneshot(
      services,
      MODULE_NAME,
      BoosterOneshots.GRACE_EXPIRE,
      guildId,
      delayMs,
      { guildId, ownerId: userId, expiresAt },
    );
  },
});

export default boosterMemberUpdateListener;
