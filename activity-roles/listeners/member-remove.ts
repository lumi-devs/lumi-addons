import type {
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import {
  Events,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import { clearGranted, ModuleName } from "../data.js";

export const memberRemoveListener: ListenerDefinition = {
  event: Events.GuildMemberRemove,
  async handler(
    member: GuildMember | PartialGuildMember,
    services: ModuleServices,
  ): Promise<void> {
    const guild = member.guild;
    if (!services.modules.isEnabled(guild.id, ModuleName)) return;
    if (member.user.bot) return;
    try {
      await clearGranted(services, guild.id, member.id);
    } catch (error) {
      services.observability.logger.warn("activity role member remove failed", {
        guildId: guild.id,
        userId: member.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
