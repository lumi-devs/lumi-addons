import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { makeInfoCard, makeSuccessCard } from "@lumi-devs/lumi/ui";
import { MODULE_NAME } from "../utilities/Keys.js";
import { getCounts, getRoleCount, resetCounts } from "../utilities/Store.js";
import { roleLabel } from "../utilities/Format.js";
import { sendLog } from "../utilities/Log.js";

async function showStats(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }

  const ref = await ctx.getRole("role");
  if (ref) {
    const count = await getRoleCount(ctx.services, guildId, ref.id);
    await ctx.reply(
      makeInfoCard(
        "📊 Mention Stats",
        `${roleLabel(ref.id, ref.name)} was mentioned **${count}** time${count === 1 ? "" : "s"} today.`,
      ),
    );
    return;
  }

  const counts = await getCounts(ctx.services, guildId);
  if (counts.size === 0) {
    await ctx.reply(
      makeInfoCard(
        "📊 Mention Stats",
        "No role mentions recorded yet today.",
      ),
    );
    return;
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((acc, [, n]) => acc + n, 0);
  const shown = sorted.slice(0, 15);
  const lines = shown.map(
    ([roleId, n], i) => `**${i + 1}.** ${roleLabel(roleId)} - **${n}**`,
  );

  await ctx.reply(
    makeInfoCard(
      "📊 Role Mention Stats",
      [
        `**Total:** ${total} · **Unique roles:** ${counts.size}`,
        lines.join("\n"),
      ],
      {
        footer: sorted.length > shown.length
          ? `Showing top ${shown.length} of ${sorted.length} · resets daily at 00:00 UTC`
          : "Resets daily at 00:00 UTC",
      },
    ),
  );
}

async function showTop(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }

  const rawLimit = await ctx.getInteger("limit");
  const limit = Math.min(Math.max(rawLimit ?? 5, 1), 25);

  const counts = await getCounts(ctx.services, guildId);
  if (counts.size === 0) {
    await ctx.reply(
      makeInfoCard(
        "📊 Top Roles",
        "No role mentions recorded yet today.",
      ),
    );
    return;
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((acc, [, n]) => acc + n, 0);
  const top = sorted.slice(0, limit);
  const lines = top.map(
    ([roleId, n], i) => `**${i + 1}.** ${roleLabel(roleId)} - **${n}**`,
  );

  await ctx.reply(
    makeInfoCard(
      `⭐ Top ${top.length} Mentioned Role${top.length === 1 ? "" : "s"}`,
      lines.join("\n"),
      { footer: `Total ${total} mentions across ${counts.size} roles today` },
    ),
  );
}

async function reset(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }

  await resetCounts(ctx.services, guildId);
  await sendLog(
    ctx.services,
    guildId,
    makeInfoCard(
      "🧹 Mention Counters Reset",
      `Counters were manually reset by <@${ctx.user.id}>.`,
    ),
  );

  await ctx.reply(
    makeSuccessCard(
      "Counters Reset",
      "Today's role mention counters have been cleared.",
    ),
  );
}

export const rolementionsDef: CommandDef = {
  name: "rolementions",
  module: MODULE_NAME,
  description: "Role mention statistics for this server.",
  guildOnly: true,
  requiredPermit: "mod.rolementions",
  build: () =>
    new SlashCommandBuilder()
      .setName("rolementions")
      .setDescription("Role mention statistics for this server.")
      .addSubcommand((sub) =>
        sub
          .setName("stats")
          .setDescription("Show mention stats for a role or all roles.")
          .addRoleOption((opt) =>
            opt
              .setName("role")
              .setDescription("Role to filter stats")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("top")
          .setDescription("Show top mentioned roles.")
          .addIntegerOption((opt) =>
            opt
              .setName("limit")
              .setDescription("Number of roles to show (1-25)")
              .setMinValue(1)
              .setMaxValue(25)
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("reset")
          .setDescription("Reset all mention counters to zero."),
      ),
  run: showStats,
  handlers: {
    stats: showStats,
    top: showTop,
    reset: {
      run: reset,
      requiredPermit: "admin.rolementions",
    },
  },
  defaultSub: "stats",
};
