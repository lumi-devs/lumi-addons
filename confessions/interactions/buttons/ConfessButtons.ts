import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
} from "discord.js";
import { defineInteraction } from "@lumi-devs/lumi/interactions";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi-devs/lumi/ui";
import type { Container } from "@lumi-devs/lumi/services";
import { getConfessionsConfig } from "../../utilities/Config.js";
import {
  authorHashFor,
  getConfession,
  getReply,
  isBanned,
  setReplyDmOptOut,
} from "../../utilities/Data.js";
import {
  buildConfessionModal,
  buildReplyModal,
  buildReplyToReplyModal,
} from "../../utilities/Ui.js";

export const confessionButtons = defineInteraction<ButtonInteraction>({
  prefix: ["confessions:btn"],
  kinds: ["button"],
  module: "confessions",
  async run(services: Container, interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    const action = parts[2];

    if (action === "mutedms" || action === "unmutedms") {
      const targetGuild = parts[3];
      if (!targetGuild) return;
      await interaction.deferReply({ ephemeral: true });
      await setReplyDmOptOut(services, targetGuild, interaction.user.id, action === "mutedms");
      if (action === "mutedms") {
        return interaction.editReply(
          ephemeralCard(
            makeWarningCard(
              "Reply DMs Off",
              "You won't be DM'd about replies in that server anymore.",
              {
                actionRows: [
                  new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId(`confessions:btn:unmutedms:${targetGuild}`)
                      .setLabel("Undo")
                      .setStyle(ButtonStyle.Secondary),
                  ),
                ],
              },
            ),
          ),
        );
      }
      return interaction.editReply(
        ephemeralCard(
          makeSuccessCard("Reply DMs On", "You'll be DM'd when someone replies to you again."),
        ),
      );
    }

    if (!interaction.guildId) return;
    const guildId = interaction.guildId;
    const number = Number(parts[3]);
    const parentK = parts[4] !== undefined ? Number(parts[4]) : null;

    const config = await getConfessionsConfig(services, guildId);

    if (action === "new") {
      const hash = await authorHashFor(services, guildId, interaction.user.id);
      if (await isBanned(services, guildId, hash)) {
        return interaction.reply(
          ephemeralCard(
            makeErrorCard("Blocked", "You can no longer submit confessions in this server."),
          ),
        );
      }
      const modal = buildConfessionModal(config.allowAttachments);
      return interaction.showModal(modal);
    }

    if (!Number.isInteger(number)) return;

    if (action === "reply" || action === "replyto") {
      const meta = await getConfession(services, guildId, number);
      if (!meta) {
        return interaction.reply(
          ephemeralCard(makeErrorCard("Gone", "That confession no longer exists.")),
        );
      }
      const hash = await authorHashFor(services, guildId, interaction.user.id);
      if (await isBanned(services, guildId, hash)) {
        return interaction.reply(
          ephemeralCard(
            makeErrorCard("Blocked", "You can no longer participate in confessions here."),
          ),
        );
      }
      const modal =
        action === "reply" || !Number.isInteger(parentK)
          ? buildReplyModal(number, config.allowAttachments)
          : buildReplyToReplyModal(number, parentK!, config.allowAttachments);
      return interaction.showModal(modal);
    }

    if (action === "report" || action === "reportreply") {
      if (!config.reportChannelId) {
        return interaction.reply(
          ephemeralCard(
            makeWarningCard("Not Configured", "Reporting is not configured in this server."),
          ),
        );
      }

      if (action === "report") {
        const meta = await getConfession(services, guildId, number);
        if (!meta) {
          return interaction.reply(
            ephemeralCard(makeErrorCard("Gone", "That confession no longer exists.")),
          );
        }
        await interaction.deferReply({ ephemeral: true });
        const body = [
          `**Reporter:** <@${interaction.user.id}> (${interaction.user.id})`,
          `**Author Hash:** \`${meta.authorHash}\``,
          `**Confession:** #${number}`,
          `**Content:** ${meta.text}`,
        ].join("\n");
        const ping = config.reportPingRoleId ? `<@&${config.reportPingRoleId}>\n` : "";
        const reportChannel = await services.client.channels.fetch(config.reportChannelId).catch(() => null);
        if (reportChannel && reportChannel.isSendable()) {
          const card = makeWarningCard(`🚨 Confession Report #${number}`, body);
          await reportChannel.send({
            content: ping || undefined,
            components: [...card.components],
            allowedMentions: { parse: [] },
          } as never).catch(() => null);
        }
        return interaction.editReply(
          ephemeralCard(
            makeSuccessCard("Report Submitted", "Thank you. Moderators have been notified."),
          ),
        );
      }

      if (action === "reportreply" && Number.isInteger(parentK)) {
        const reply = await getReply(services, guildId, number, parentK!);
        if (!reply) {
          return interaction.reply(
            ephemeralCard(makeErrorCard("Gone", "That reply no longer exists.")),
          );
        }
        await interaction.deferReply({ ephemeral: true });
        const body = [
          `**Reporter:** <@${interaction.user.id}> (${interaction.user.id})`,
          `**Author Hash:** \`${reply.authorHash}\``,
          `**Confession:** #${number}`,
          `**Reply:** #${number}.${parentK}`,
          `**Content:** ${reply.text}`,
        ].join("\n");
        const ping = config.reportPingRoleId ? `<@&${config.reportPingRoleId}>\n` : "";
        const reportChannel = await services.client.channels.fetch(config.reportChannelId).catch(() => null);
        if (reportChannel && reportChannel.isSendable()) {
          const card = makeWarningCard(`🚨 Reply Report #${number}.${parentK}`, body);
          await reportChannel.send({
            content: ping || undefined,
            components: [...card.components],
            allowedMentions: { parse: [] },
          } as never).catch(() => null);
        }
        return;
      }
    }
    return;
  },
});
