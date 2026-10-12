import { Events } from "discord.js";
import type { Message } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import { makeInfoCard } from "#src/lib/ui/Cards.js";
import { MODULE_NAME } from "../utilities/Keys.js";
import {
  getBlocks,
  getProtectedRoles,
  incrementMentions,
} from "../utilities/Store.js";
import { applyBlock } from "../utilities/Protection.js";
import { sendLog } from "../utilities/Log.js";
import { roleMention } from "../utilities/Format.js";

export const messageCreateListener = defineListener({
  name: "rolementionsMessageCreate",
  event: Events.MessageCreate,
  module: MODULE_NAME,
  guildId: (message: Message) => message.guildId ?? null,
  async execute(services: Container, message: Message): Promise<void> {
    if (message.partial) {
      const full = await message.fetch().catch(() => null);
      if (!full) return;
      message = full;
    }
    if (message.webhookId !== null) return;
    if (message.system) return;
    if (message.author.bot) return;
    if (!message.inGuild()) return;

    const guildId = message.guildId;
    const roleIds = [...message.mentions.roles.keys()];
    if (roleIds.length === 0) return;

    const [counts, autoProtect] = await Promise.all([
      incrementMentions(services, guildId, roleIds),
      services.db.config.getModuleConfig(guildId, MODULE_NAME, "auto_protect"),
    ]);

    if (autoProtect !== false) {
      const [protectedRoles, blocks] = await Promise.all([
        getProtectedRoles(services, guildId),
        getBlocks(services, guildId),
      ]);
      for (const roleId of roleIds) {
        const duration = protectedRoles.get(roleId);
        if (duration === undefined) continue;
        if (blocks.has(roleId)) continue;
        const roleName = message.guild.roles.cache.get(roleId)?.name;
        await applyBlock(
          services,
          guildId,
          roleId,
          duration,
          false,
          roleName,
        ).catch((err: unknown) => {
          services.logger.warn(
            `[rolementions] auto-protect failed in ${guildId}: ${String(err)}`,
          );
        });
      }
    }

    const lines = roleIds.map(
      (roleId) => `⚡ ${roleMention(roleId)} - **${counts.get(roleId) ?? 0}** today`,
    );
    await sendLog(
      services,
      guildId,
      makeInfoCard(
        `🔔 Role Mention${roleIds.length === 1 ? "" : "s"} Detected`,
        [
          `By <@${message.author.id}> in <#${message.channelId}> - ${message.url}`,
          lines.join("\n"),
        ],
        { footer: "Counters reset daily at 00:00 UTC." },
      ),
    );
  },
});
