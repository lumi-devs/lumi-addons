import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from "discord.js";
import { defineInteraction } from "@lumi-devs/lumi/lib/interactions/InteractionDef.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi-devs/lumi/lib/ui/Cards.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { MODULE_NAME } from "../../utilities/Keys.js";
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

export const confessButtons = defineInteraction<ButtonInteraction>({
  prefix: [
    "confessions:btn:new",
    "confessions:btn:reply",
    "confessions:btn:replyto",
    "confessions:btn:report",
    "confessions:btn:reportreply",
    "confessions:btn:mutedms",
    "confessions:btn:unmutedms",
  ],
  kinds: ["button"],
  module: MODULE_NAME,
  async run(services: Container, interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split(":");
    const action = parts[2];

    if (action === "mutedms" || action === "unmutedms") {
      const targetGuild = parts[3];
      if (!targetGuild) return;
      await interaction.deferReply({ ephemeral: true });
      await setReplyDmOptOut(services, targetGuild, interaction.user.id, action === "mutedms");
      if (action === "mutedms") {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`confessions:btn:unmutedms:${targetGuild}`)
            .setLabel("Undo")
            .setStyle(ButtonStyle.Secondary),
        );
        await interaction.editReply(
          ephemeralCard(
            makeWarningCard(
              "Reply DMs Off",
              "You will not be DM'd about replies in that server anymore.",
              { actionRows: [row] },
            ),
          ),
        );
        return;
      }
      await interaction.editReply(
        ephemeralCard(
          makeSuccessCard("Reply DMs On", "You will be DM'd when someone replies to you again."),
        ),
      );
      return;
    }

    if (!interaction.inGuild() || !interaction.guildId) return;
    const guildId = interaction.guildId;
    const number = Number(parts[3]);
    const parentK = parts[4] !== undefined ? Number(parts[4]) : null;

    const config = await getConfessionsConfig(services, guildId);

    if (action === "new") {
      const hash = await authorHashFor(services, guildId, interaction.user.id);
      if (await isBanned(services, guildId, hash)) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Blocked", "You can no longer submit confessions in this server."),
          ),
        );
        return;
      }
      await interaction.showModal(buildConfessionModal(config.allowAttachments));
      return;
    }

    if (!Number.isInteger(number)) return;

    if (action === "reply" || action === "replyto") {
      const meta = await getConfession(services, guildId, number);
      if (!meta) {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Gone", "That confession no longer exists.")),
        );
        return;
      }
      const hash = await authorHashFor(services, guildId, interaction.user.id);
      if (await isBanned(services, guildId, hash)) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Blocked", "You can no longer participate in confessions here."),
          ),
        );
        return;
      }
      const modal =
        action === "reply" || !Number.isInteger(parentK)
          ? buildReplyModal(number, config.allowAttachments)
          : buildReplyToReplyModal(number, parentK!, config.allowAttachments);
      await interaction.showModal(modal);
      return;
    }

    if (action === "report" || action === "reportreply") {
      if (!config.reportChannelId) {
        await interaction.reply(
          ephemeralCard(
            makeWarningCard("Not Configured", "Reporting is not configured in this server."),
          ),
        );
        return;
      }

      if (action === "report") {
        const meta = await getConfession(services, guildId, number);
        if (!meta) {
          await interaction.reply(
            ephemeralCard(makeErrorCard("Gone", "That confession no longer exists.")),
          );
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        const body = [
          `**Reporter:** <@${interaction.user.id}> (${interaction.user.id})`,
          `**Author Hash:** \`${meta.authorHash}\``,
          `**Confession:** #${number}`,
          `**Content:** ${meta.text}`,
        ].join("\n");
        const modRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`confessions:btn:approve:${number}`)
            .setLabel("Approve (Keep)")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`confessions:btn:reject:${number}`)
            .setLabel("Reject (Delete)")
            .setStyle(ButtonStyle.Danger),
        );
        const ping = config.reportPingRoleId ? `<@&${config.reportPingRoleId}>\n` : "";
        const reportChannel = await services.client.channels.fetch(config.reportChannelId).catch(() => null);
        if (reportChannel && reportChannel.isSendable()) {
          const card = makeWarningCard(`🚨 Confession Report #${number}`, body, {
            actionRows: [modRow],
          });
          await reportChannel.send({
            content: ping || undefined,
            components: [...card.components],
            allowedMentions: { parse: [] },
          } as any).catch(() => null);
        }
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard("Report Submitted", "Thank you, the moderators have been notified."),
          ),
        );
        return;
      }

      if (!Number.isInteger(parentK)) return;
      const parent = await getReply(services, guildId, number, parentK!);
      if (!parent) {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Gone", "That reply no longer exists.")),
        );
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const body = [
        `**Reporter:** <@${interaction.user.id}> (${interaction.user.id})`,
        `**Author Hash:** \`${parent.authorHash}\``,
        `**Reply:** #${number}.${parentK}`,
        `**Content:** ${parent.text}`,
      ].join("\n");
      const modRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`confessions:btn:approve:${number}`)
          .setLabel("Approve (Keep)")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`confessions:btn:reject:${number}:${parentK}`)
          .setLabel("Reject (Delete)")
          .setStyle(ButtonStyle.Danger),
      );
      const ping = config.reportPingRoleId ? `<@&${config.reportPingRoleId}>\n` : "";
      const reportChannel = await services.client.channels.fetch(config.reportChannelId).catch(() => null);
      if (reportChannel && reportChannel.isSendable()) {
        const card = makeWarningCard(`🚨 Reply Report - #${number}.${parentK}`, body, {
          actionRows: [modRow],
        });
        await reportChannel.send({
          content: ping || undefined,
          components: [...card.components],
          allowedMentions: { parse: [] },
        } as any).catch(() => null);
      }
      await interaction.editReply(
        ephemeralCard(
          makeSuccessCard("Report Submitted", "Thank you, the moderators have been notified."),
        ),
      );
      return;
    }
  },
});
