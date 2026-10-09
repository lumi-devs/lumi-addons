import { defineCommand, type CommandContext } from "lumi/commands";
import { voiceChannels } from "lumi/discord";
import { makeInfoCard } from "lumi/ui";
import { MODULE_NAME } from "../keys.js";
import { getLoungeConfig } from "../lib/config.js";
import { getExtras, getStats } from "../lib/data.js";
import { reconcileGuild } from "../lib/manage.js";

const channelMention = (id: string): string => `<#${id}>`;

async function liveCount(channelId: string): Promise<number> {
  try {
    return (await voiceChannels.members(channelId)).length;
  } catch {
    return 0;
  }
}

async function showStats(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError(
      "Guild Only",
      "This command only works inside a server.",
    );
    return;
  }

  await reconcileGuild(guildId);

  const config = await getLoungeConfig(guildId);
  if (config.baseChannelIds.length === 0) {
    await ctx.replyWarning(
      "Not Configured",
      `Add one or more base lounges with \`/config\` → **${MODULE_NAME}** → Base Lounges first.`,
    );
    return;
  }

  const groups: string[] = [];
  for (const baseId of config.baseChannelIds) {
    const extras = await getExtras(guildId, baseId);
    const lines = [
      `${channelMention(baseId)} · ${await liveCount(baseId)} *(base)*`,
    ];
    for (const e of [...extras].sort((a, b) => a.number - b.number)) {
      lines.push(
        `${channelMention(e.channelId)} · ${await liveCount(e.channelId)} *(#${e.number})*`,
      );
    }
    groups.push(lines.join("\n"));
  }

  const stats = await getStats(guildId);
  const body = [
    `Up to **${config.maxExtras}** lounges/base · **${config.cooldownSeconds}s** cooldown`,
    ...groups,
    `Created **${stats.creations}** · Removed **${stats.deletions}** · Peak **${stats.peakUsers}** concurrent`,
  ];

  await ctx.reply(makeInfoCard("🛋️ Multi Lounge", body));
}

export default defineCommand({
  name: "lounge",
  description: "Dynamic voice lounge controls.",
  build: () => ({
    name: "lounge",
    description: "Dynamic voice lounge controls.",
    options: [
      {
        type: 1,
        name: "stats",
        description: "Show live lounge state and lifetime stats.",
      },
    ],
  }),
  run: showStats,
});
