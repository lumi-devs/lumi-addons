import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ButtonInteraction, roleMention } from "discord.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "#utilities/cards.js";
import { getConfessionsConfig } from "../lib/config.js";
import { authorHashFor, getConfession, isBanned } from "../lib/data.js";
import {
  buildConfessionModal,
  buildReplyModal,
  buildReplyToReplyModal,
} from "../lib/ui.js";

type ParsedData =
  | { action: "new" }
  | { action: "reply"; number: number }
  | { action: "report"; number: number }
  | { action: "replyto"; number: number; parentMessageId: string }
  | { action: "reportreply"; number: number; parentMessageId: string };

function extractBodyFromV2Message(msg: any): string {
  try {
    const container = msg.components?.[0];
    if (!container || container.type !== 20) return "";
    const textComponents = container.children?.filter(
      (c: any) => c.type === 21,
    );
    if (!textComponents || textComponents.length === 0) return "";
    const bodyComponents = textComponents.filter(
      (c: any) =>
        c.content &&
        !c.content.startsWith("##") &&
        !c.content.startsWith("-#") &&
        !c.content.startsWith(">"),
    );
    return bodyComponents[bodyComponents.length - 1]?.content ?? "";
  } catch {
    return "";
  }
}

@ApplyOptions<InteractionHandler.Options>({
  name: "confessions-reply-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ConfessionReplyButtonHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    if (parts[0] !== "confess") return this.none();

    const action = parts[1];
    if (action === "new_button") {
      return this.some({ action: "new" });
    }
    if (action === "reply") {
      const number = Number(parts[2]);
      return Number.isInteger(number)
        ? this.some({ action: "reply", number })
        : this.none();
    }
    if (action === "report") {
      const number = Number(parts[2]);
      return Number.isInteger(number)
        ? this.some({ action: "report", number })
        : this.none();
    }
    if (action === "replyto") {
      const number = Number(parts[2]);
      const parentMessageId = parts[3];
      return Number.isInteger(number) && parentMessageId
        ? this.some({ action: "replyto", number, parentMessageId })
        : this.none();
    }
    if (action === "reportreply") {
      const number = Number(parts[2]);
      const parentMessageId = parts[3];
      return Number.isInteger(number) && parentMessageId
        ? this.some({ action: "reportreply", number, parentMessageId })
        : this.none();
    }

    return this.none();
  }

  public async run(interaction: ButtonInteraction, data: ParsedData) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const { guildId } = interaction;

    const config = await getConfessionsConfig(guildId);

    if (data.action === "new") {
      const hash = await authorHashFor(guildId, interaction.user.id);
      if (await isBanned(guildId, hash)) {
        return interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Blocked",
              "You can no longer submit confessions in this server.",
            ),
          ),
        );
      }
      return interaction.showModal(
        buildConfessionModal(config.allowAttachments),
      );
    }

    const meta = await getConfession(guildId, data.number);
    if (!meta) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard("Gone", "That confession no longer exists."),
        ),
      );
    }

    const hash = await authorHashFor(guildId, interaction.user.id);
    if (await isBanned(guildId, hash)) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Blocked",
            "You can no longer participate in confessions here.",
          ),
        ),
      );
    }

    if (data.action === "reply") {
      return interaction.showModal(
        buildReplyModal(data.number, config.allowAttachments),
      );
    }

    if (data.action === "replyto") {
      return interaction.showModal(
        buildReplyToReplyModal(
          data.number,
          data.parentMessageId,
          config.allowAttachments,
        ),
      );
    }

    if (data.action === "report") {
      await interaction.deferReply({ ephemeral: true });

      const reportChannel = config.reportChannelId
        ? await interaction.guild.channels
            .fetch(config.reportChannelId)
            .catch(() => null)
        : null;

      if (
        reportChannel &&
        reportChannel.isTextBased() &&
        "send" in reportChannel
      ) {
        const pingText = config.reportPingRoleId
          ? roleMention(config.reportPingRoleId)
          : "";
        await reportChannel
          .send({
            content: pingText,
            ...makeWarningCard(
              `🚨 Confession Report #${data.number}`,
              [
                `**Reporter:** ${interaction.user.tag} (${interaction.user.id})`,
                `**Author Hash:** \`${meta.authorHash}\``,
                `**Content:** ${meta.text || "*(no metadata content stored)*"}`,
              ].join("\n"),
            ),
            allowedMentions: config.reportPingRoleId
              ? { roles: [config.reportPingRoleId] }
              : { parse: [] },
          })
          .catch(() => null);
      }

      return interaction.editReply(
        ephemeralCard(
          makeSuccessCard(
            "Report Submitted",
            "Thank you, the moderators have been notified.",
          ),
        ),
      );
    }

    if (data.action === "reportreply") {
      await interaction.deferReply({ ephemeral: true });

      const reportChannel = config.reportChannelId
        ? await interaction.guild.channels
            .fetch(config.reportChannelId)
            .catch(() => null)
        : null;

      if (
        reportChannel &&
        reportChannel.isTextBased() &&
        "send" in reportChannel
      ) {
        const thread = meta.threadId
          ? await interaction.guild.channels
              .fetch(meta.threadId)
              .catch(() => null)
          : null;
        const parentMessage =
          thread && "messages" in thread
            ? await thread.messages
                .fetch(data.parentMessageId)
                .catch(() => null)
            : null;
        const parentText = parentMessage
          ? extractBodyFromV2Message(parentMessage)
          : "";

        const pingText = config.reportPingRoleId
          ? roleMention(config.reportPingRoleId)
          : "";
        await reportChannel
          .send({
            content: pingText,
            ...makeWarningCard(
              `🚨 Reply Report — Confession #${data.number}`,
              [
                `**Reporter:** ${interaction.user.tag} (${interaction.user.id})`,
                `**Parent Message:** ${parentMessage ? parentMessage.url : "Unknown"}`,
                `**Content:** ${parentText || "*(could not retrieve reply text)*"}`,
              ].join("\n"),
            ),
            allowedMentions: config.reportPingRoleId
              ? { roles: [config.reportPingRoleId] }
              : { parse: [] },
          })
          .catch(() => null);
      }

      return interaction.editReply(
        ephemeralCard(
          makeSuccessCard(
            "Report Submitted",
            "Thank you, the moderators have been notified.",
          ),
        ),
      );
    }

    throw new Error(`Unhandled action: ${(data as any).action}`);
  }
}
