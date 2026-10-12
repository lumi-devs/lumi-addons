import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/lib/commands/CommandDef.js";
import type { CommandContext } from "@lumi-devs/lumi/lib/commands/Context.js";
import { makeInfoCard, makeWarningCard } from "@lumi-devs/lumi/lib/ui/Cards.js";
import { MODULE_NAME } from "../utilities/Keys.js";
import { getLoungeConfig } from "../utilities/Config.js";
import { getExtras, getStats } from "../utilities/Data.js";
import { countOccupants, reconcileGuild } from "../utilities/Manage.js";

const channelMention = (id: string): string => `<#${id}>`;

async function showStats(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError(
      "Guild Only",
      "This command only works inside a server.",
    );
    return;
  }

  await reconcileGuild(ctx.services, guildId);

  const config = await getLoungeConfig(ctx.services, guildId);
  if (config.baseChannelIds.length === 0) {
    await ctx.reply(
      makeWarningCard(
        "Not Configured",
        `Add one or more base lounges with \`/config\` -> **${MODULE_NAME}** -> Base Lounges first.`,
      ),
    );
    return;
  }

  const groups: string[] = [];
  for (const baseId of config.baseChannelIds) {
    const extras = await getExtras(ctx.services, guildId, baseId);
    const lines = [
      `${channelMention(baseId)} * ${await countOccupants(ctx.services, guildId, baseId)} *(base)*`,
    ];
    for (const e of [...extras].sort((a, b) => a.number - b.number)) {
      lines.push(
        `${channelMention(e.channelId)} * ${await countOccupants(ctx.services, guildId, e.channelId)} *(#${e.number})*`,
      );
    }
    groups.push(lines.join("\n"));
  }

  const stats = await getStats(ctx.services, guildId);
  const body = [
    `Up to **${config.maxExtras}** lounges/base * **${config.cooldownSeconds}s** cooldown`,
    ...groups,
    `Created **${stats.creations}** * Removed **${stats.deletions}** * Peak **${stats.peakUsers}** concurrent`,
  ];

  await ctx.reply(makeInfoCard("Multi Lounge", body));
}

export const loungeDef: CommandDef = {
  name: "lounge",
  module: MODULE_NAME,
  description: "Dynamic voice lounge controls.",
  guildOnly: true,
  requiredPermit: "admin.lounge",
  build: () =>
    new SlashCommandBuilder()
      .setName("lounge")
      .setDescription("Dynamic voice lounge controls.")
      .addSubcommand((sub) =>
        sub
          .setName("stats")
          .setDescription("Show live lounge state and lifetime stats."),
      ),
  handlers: {
    stats: showStats,
  },
  defaultSub: "stats",
};
