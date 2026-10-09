import type { InteractionContext } from "lumi/interactions";
import { actionRow, makeWarningCard } from "lumi/ui";
import { channels } from "lumi/discord";
import { getConfessionsConfig } from "../lib/config.js";
import {
  authorHashFor,
  getConfession,
  getReply,
  isBanned,
  setReplyDmOptOut,
} from "../lib/data.js";
import {
  buildConfessionModal,
  buildReplyModal,
  buildReplyToReplyModal,
} from "../lib/ui.js";

export default {
  prefix: "confessions:btn",
  run: async (ctx: InteractionContext) => {
    const parts = ctx.customId.split(":");
    const action = parts[2];

    if (action === "mutedms" || action === "unmutedms") {
      const targetGuild = parts[3];
      if (!targetGuild) return;
      await ctx.defer();
      await setReplyDmOptOut(targetGuild, ctx.user.id, action === "mutedms");
      if (action === "mutedms") {
        return ctx.reply(
          makeWarningCard("Reply DMs Off", "You won't be DM'd about replies in that server anymore.", {
            actionRows: [
              actionRow([
                {
                  customId: `confessions:btn:unmutedms:${targetGuild}`,
                  label: "Undo",
                  style: "secondary",
                },
              ]),
            ],
          }),
        );
      }
      return ctx.replySuccess("Reply DMs On", "You'll be DM'd when someone replies to you again.");
    }

    if (!ctx.guildId) return;
    const guildId = ctx.guildId;
    const number = Number(parts[3]);
    const parentK = parts[4] !== undefined ? Number(parts[4]) : null;

    const config = await getConfessionsConfig(guildId);

    if (action === "new") {
      const hash = await authorHashFor(guildId, ctx.user.id);
      if (await isBanned(guildId, hash)) {
        return ctx.replyError(
          "Blocked",
          "You can no longer submit confessions in this server.",
        );
      }
      return ctx.showModal(buildConfessionModal(config.allowAttachments));
    }

    if (!Number.isInteger(number)) return;

    if (action === "reply" || action === "replyto") {
      const meta = await getConfession(guildId, number);
      if (!meta) {
        return ctx.replyError("Gone", "That confession no longer exists.");
      }
      const hash = await authorHashFor(guildId, ctx.user.id);
      if (await isBanned(guildId, hash)) {
        return ctx.replyError(
          "Blocked",
          "You can no longer participate in confessions here.",
        );
      }
      return ctx.showModal(
        action === "reply" || !Number.isInteger(parentK)
          ? buildReplyModal(number, config.allowAttachments)
          : buildReplyToReplyModal(number, parentK!, config.allowAttachments),
      );
    }

    if (action === "report" || action === "reportreply") {
      if (!config.reportChannelId) {
        return ctx.replyWarning(
          "Not Configured",
          "Reporting is not configured in this server.",
        );
      }

      if (action === "report") {
        const meta = await getConfession(guildId, number);
        if (!meta) {
          return ctx.replyError("Gone", "That confession no longer exists.");
        }
        await ctx.defer();
        const body = [
          `**Reporter:** <@${ctx.user.id}> (${ctx.user.id})`,
          `**Author Hash:** \`${meta.authorHash}\``,
          `**Confession:** #${number}`,
          `**Content:** ${meta.text}`,
        ].join("\n");
        const ping = config.reportPingRoleId ? `<@&${config.reportPingRoleId}>\n` : "";
        await channels
          .send(config.reportChannelId, {
            content: ping || undefined,
            ...makeWarningCard(`🚨 Confession Report #${number}`, body),
          })
          .catch(() => null);
        return ctx.replySuccess(
          "Report Submitted",
          "Thank you, the moderators have been notified.",
        );
      }

      if (!Number.isInteger(parentK)) return;
      const parent = await getReply(guildId, number, parentK!);
      if (!parent) {
        return ctx.replyError("Gone", "That reply no longer exists.");
      }
      await ctx.defer();
      const body = [
        `**Reporter:** <@${ctx.user.id}> (${ctx.user.id})`,
        `**Author Hash:** \`${parent.authorHash}\``,
        `**Reply:** #${number}.${parentK}`,
        `**Content:** ${parent.text}`,
      ].join("\n");
      const ping = config.reportPingRoleId ? `<@&${config.reportPingRoleId}>\n` : "";
      await channels
        .send(config.reportChannelId, {
          content: ping || undefined,
          ...makeWarningCard(`🚨 Reply Report — #${number}.${parentK}`, body),
        })
        .catch(() => null);
      return ctx.replySuccess(
        "Report Submitted",
        "Thank you, the moderators have been notified.",
      );
    }
  },
};
