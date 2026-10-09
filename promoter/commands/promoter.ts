import { defineCommand, type CommandContext } from "lumi/commands";
import { actionRow, makeInfoCard } from "lumi/ui";
import { channels } from "lumi/discord";
import { getPromoterConfig, getStats } from "../lib/evaluate.js";

export default defineCommand({
  name: "promoter",
  description: "Promoter-role tools.",
  build: () => ({
    name: "promoter",
    description: "Promoter-role tools.",
    options: [
      {
        type: 1,
        name: "panel",
        description: "Post the persistent promoter info panel here",
      },
      {
        type: 1,
        name: "stats",
        description: "Show grant/revoke totals",
      },
    ],
  }),
  run: async (ctx: CommandContext) => {
    if (!ctx.guildId) {
      return ctx.replyError(
        "Guild Only",
        "This command only works inside a server.",
      );
    }
    if (ctx.subcommand === "stats") return chatInputStats(ctx);
    return chatInputPanel(ctx);
  },
  handlers: {
    panel: async (ctx: CommandContext) => {
      if (!ctx.guildId) {
        return ctx.replyError(
          "Guild Only",
          "This command only works inside a server.",
        );
      }
      return chatInputPanel(ctx);
    },
    stats: async (ctx: CommandContext) => {
      if (!ctx.guildId) {
        return ctx.replyError(
          "Guild Only",
          "This command only works inside a server.",
        );
      }
      return chatInputStats(ctx);
    },
  },
});

async function chatInputPanel(ctx: CommandContext): Promise<void> {
  try {
    await ctx.checkPermit("admin.*");
  } catch {
    return ctx.replyError(
      "Permission Denied",
      "Posting the panel is restricted to admins.",
    );
  }
  const guildId = ctx.guildId!;
  const cfg = await getPromoterConfig(guildId);
  if (!cfg.roleId || cfg.matchTerms.length === 0) {
    return ctx.replyError(
      "Not Configured",
      "Set `promoter_role_id` and `match_terms` in `/config` first.",
    );
  }

  const card = makeInfoCard(
    "Promote the Server, Get the Role",
    `Put our invite or tag in your **custom status** and receive <@&${cfg.roleId}> automatically. Remove it and the role goes away.\n\nAlready did it? Hit the button to be checked right now.`,
    {
      actionRows: [
        actionRow([
          {
            customId: "promoter:check",
            label: "Check my status",
            style: "primary",
          },
        ]),
      ],
    },
  );
  try {
    await channels.send(ctx.channelId, card);
  } catch {
    return ctx.replyError(
      "Error",
      "Couldn't post the panel in this channel.",
    );
  }
  return ctx.replySuccess("Panel Posted", "The promoter panel is live.");
}

async function chatInputStats(ctx: CommandContext): Promise<void> {
  try {
    await ctx.checkPermit("mod.*");
  } catch {
    return ctx.replyError(
      "Permission Denied",
      "Viewing stats is restricted to moderators.",
    );
  }
  const stats = await getStats(ctx.guildId!);
  return ctx.replyInfo(
    "Promoter Stats",
    `**${stats.granted}** roles granted · **${stats.revoked}** roles revoked (all-time).`,
  );
}
