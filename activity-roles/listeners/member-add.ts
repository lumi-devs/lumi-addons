import type {
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import { Events, type GuildMember } from "discord.js";
import { ModuleName } from "../data.js";
import { activitiesFromPresence } from "../logic.js";
import { reconcileMember } from "../runtime.js";

export const memberAddListener: ListenerDefinition = {
  event: Events.GuildMemberAdd,
  async handler(
    member: GuildMember,
    services: ModuleServices,
  ): Promise<void> {
    const guild = member.guild;
    if (!services.modules.isEnabled(guild.id, ModuleName)) return;
    if (member.user.bot) return;
    const presence = member.presence;
    try {
      await reconcileMember(
        services,
        guild,
        member,
        presence ? activitiesFromPresence(presence) : [],
      );
    } catch (error) {
      services.observability.logger.warn("activity role member add failed", {
        guildId: guild.id,
        userId: member.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
