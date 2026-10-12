import type { ButtonInteraction, GuildMember } from "discord.js";
import { defineInteraction } from "@lumi-devs/lumi/lib/interactions/InteractionDef.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "@lumi-devs/lumi/lib/ui/Cards.js";
import { permitSubject } from "@lumi-devs/lumi/lib/api/permissions/Subject.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { MODULE_NAME } from "../../utilities/Keys.js";
import { getConfessionsConfig } from "../../utilities/Config.js";
import { deleteConfession, getConfession, getReply } from "../../utilities/Data.js";

export const modButtons = defineInteraction<ButtonInteraction>({
  prefix: [
    "confessions:btn:approve",
    "confessions:btn:reject",
    "confessions:btn:mod:approve",
    "confessions:btn:mod:reject",
  ],
  kinds: ["button"],
  module: MODULE_NAME,
  async run(services: Container, interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) return;
    const { guildId, guild } = interaction;

    const subject = permitSubject(
      guild,
      interaction.user.id,
      interaction.member as GuildMember | null,
      interaction.channelId,
    );
    if (!subject) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Permission Denied", "Action can only be used in a server.")),
      );
      return;
    }

    try {
      await services.permitResolver.assertPermit({ ...subject, permitNode: "mod.*" });
    } catch {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Access Denied", "You need moderator permissions to use this.")),
      );
      return;
    }

    const parts = interaction.customId.split(":");
    const isModPrefix = parts[2] === "mod";
    const action = isModPrefix ? parts[3] : parts[2];
    const number = Number(isModPrefix ? parts[4] : parts[3]);
    const parentK = (isModPrefix ? parts[5] : parts[4]) !== undefined
      ? Number(isModPrefix ? parts[5] : parts[4])
      : null;

    if (!Number.isInteger(number)) return;

    if (action === "approve") {
      await interaction.update({
        ...makeSuccessCard(
          "Report Dismissed",
          `Report for **Confession #${number}** was approved / dismissed by <@${interaction.user.id}>.`,
        ),
        components: [],
      });
      return;
    }

    if (action === "reject") {
      const config = await getConfessionsConfig(services, guildId);
      if (Number.isInteger(parentK)) {
        const reply = await getReply(services, guildId, number, parentK!);
        if (reply?.messageId) {
          const meta = await getConfession(services, guildId, number);
          const targetChannelId = meta?.threadId ?? config.channelId;
          if (targetChannelId) {
            const channel = await services.client.channels.fetch(targetChannelId).catch(() => null);
            if (channel && channel.isTextBased()) {
              const msg = await channel.messages.fetch(reply.messageId).catch(() => null);
              if (msg) await msg.delete().catch(() => null);
            }
          }
        }
        await interaction.update({
          ...makeErrorCard(
            "Reply Deleted",
            `**Reply #${number}.${parentK}** was rejected and deleted by <@${interaction.user.id}>.`,
          ),
          components: [],
        });
        return;
      }

      const meta = await getConfession(services, guildId, number);
      if (meta) {
        if (config.channelId && meta.messageId) {
          const channel = await services.client.channels.fetch(config.channelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const msg = await channel.messages.fetch(meta.messageId).catch(() => null);
            if (msg) await msg.delete().catch(() => null);
          }
        }
        if (meta.threadId) {
          const thread = await services.client.channels.fetch(meta.threadId).catch(() => null);
          if (thread) await thread.delete().catch(() => null);
        }
        await deleteConfession(services, guildId, number);
      }

      await interaction.update({
        ...makeErrorCard(
          "Confession Deleted",
          `**Confession #${number}** was rejected and deleted by <@${interaction.user.id}>.`,
        ),
        components: [],
      });
      return;
    }
  },
});
