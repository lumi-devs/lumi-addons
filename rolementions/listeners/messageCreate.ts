import type {
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import { Events, type Message } from "discord.js";
import { ModuleName, readConfig } from "../config.js";
import { recordRoleMentions } from "../data.js";
import { applyBlock } from "../protection.js";

export const messageCreateListener: ListenerDefinition = {
  event: Events.MessageCreate,
  async handler(message: Message, services: ModuleServices) {
    let target = message;
    if (target.partial) {
      const fetched = await target.fetch().catch(() => null);
      if (!fetched) return;
      target = fetched;
    }

    if (!target.inGuild()) return;
    if (
      target.author.bot ||
      target.system ||
      target.webhookId !== null
    ) {
      return;
    }

    const guild = target.guild;
    if (!guild) return;
    if (!services.modules.isEnabled(guild.id, ModuleName)) return;

    const roleIds = [...new Set(target.mentions.roles.keys())];
    if (roleIds.length === 0) return;

    const config = await readConfig(services, guild.id);
    if (config.analyticsEnabled) {
      await recordRoleMentions(services, guild.id, roleIds).catch(
        (error: unknown) => {
          services.observability?.logger?.warn?.(
            "role mention analytics failed",
            { guildId: guild.id, error },
          );
        },
      );
    }

    if (config.protectedRoleIds.length === 0) return;
    const protectedRoleIds = new Set(config.protectedRoleIds);
    const protectedMentions = roleIds.filter((roleId) =>
      protectedRoleIds.has(roleId),
    );

    for (const roleId of protectedMentions) {
      await applyBlock(
        services,
        guild,
        roleId,
        config.autoBlockMinutes,
        false,
        config.logChannelId,
      ).catch((error: unknown) => {
        services.observability?.logger?.warn?.(
          "role mention auto-block failed",
          { guildId: guild.id, roleId, error },
        );
      });
    }
  },
};