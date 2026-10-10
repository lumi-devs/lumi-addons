import { defineCommand, type CommandContext } from "lumi/commands";
import { makeInfoCard, makeSuccessCard } from "lumi/ui";
import { getCounts, getRoleCount, resetCounts } from "../lib/store.js";
import { roleLabel } from "../lib/format.js";
import { sendLog } from "../lib/log.js";

async function showStats(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }

  const ref = await ctx.getRole("role");
  if (ref) {
    const count = await getRoleCount(guildId, ref.id);
    await ctx.reply(
      makeInfoCard(
        "📊 Mention Stats",
        `${roleLabel(ref.id, ref.name)} was mentioned **${count}** time${count === 1 ? "" : "s"} today.`,
      ),
    );
    return;
  }

  const counts = await getCounts(guildId);
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
    ([roleId, n], i) => `**${i + 1}.** ${roleLabel(roleId)} — **${n}**`,
  );

  await ctx.reply(
    makeInfoCard("📊 Role Mention Stats", [
      `**Total:** ${total} · **Unique roles:** ${counts.size}`,
      lines.join("\n"),
    ], {
      footer: sorted.length > shown.length
        ? `Showing top ${shown.length} of ${sorted.length} · resets daily at 00:00 UTC`
        : "Resets daily at 00:00 UTC",
    }),
  );
}

async function showTop(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }

  const rawLimit = await ctx.getInteger("limit");
  const limit = Math.min(Math.max(rawLimit ?? 5, 1), 25);

  const counts = await getCounts(guildId);
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
    ([roleId, n], i) => `**${i + 1}.** ${roleLabel(roleId)} — **${n}**`,
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
  await ctx.checkPermit("admin.*");
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }

  await resetCounts(guildId);
  await sendLog(
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

export default defineCommand({
  name: "rolementions",
  description: "Role mention statistics for this server.",
  build: () => ({
    name: "rolementions",
    description: "Role mention statistics for this server.",
    options: [
      {
        type: 1,
        name: "stats",
        description: "Show mention stats for a role or all roles.",
        options: [
          {
            type: 8,
            name: "role",
            description: "Role to filter stats",
            required: false,
          },
        ],
      },
      {
        type: 1,
        name: "top",
        description: "Show top mentioned roles.",
        options: [
          {
            type: 4,
            name: "limit",
            description: "Number of roles to show (1-25)",
            required: false,
            min_value: 1,
            max_value: 25,
          },
        ],
      },
      {
        type: 1,
        name: "reset",
        description: "Reset all mention counters to zero.",
      },
    ],
  }),
  run: showStats,
  handlers: { stats: showStats, top: showTop, reset },
});
