import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { ChannelType } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  ephemeralCard,
  makeInfoCard,
  makeWarningCard,
} from "#utilities/cards.js";
import { MODULE_NAME } from "../keys.js";
import { getLoungeConfig } from "../lib/config.js";
import { getExtras, getStats } from "../lib/data.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "lounge",
  description: "Auto-scaling voice lounge controls.",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  subcommands: [{ name: "stats", chatInputRun: "chatInputRunStats" }],
})
export class LoungeCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("stats")
            .setDescription("Show live lounge state and lifetime stats."),
        ),
    );
  }

  public async chatInputRunStats(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const config = await getLoungeConfig(guild.id);

    if (config.baseChannelIds.length === 0) {
      return this.reply(
        interaction,
        ephemeralCard(
          makeWarningCard(
            "Not Configured",
            `Add one or more base lounges with \`/config\` → **${MODULE_NAME}** → Base Lounges first.`,
          ),
        ),
      );
    }

    const cap = (limit: number) => (limit === 0 ? "∞" : String(limit));
    const countFor = (id: string): string => {
      const ch = guild.channels.cache.get(id);
      if (!ch || ch.type !== ChannelType.GuildVoice) return "*(missing)*";
      return `${ch.members.size}/${cap(ch.userLimit)}`;
    };

    const groups: string[] = [];
    for (const baseId of config.baseChannelIds) {
      const extras = await getExtras(guild.id, baseId);
      const lines = [
        `${channelMention(baseId)} · ${countFor(baseId)} *(base)*`,
        ...[...extras]
          .sort((a, b) => a.number - b.number)
          .map(
            (e) =>
              `${channelMention(e.channelId)} · ${countFor(e.channelId)} *(#${e.number})*`,
          ),
      ];
      groups.push(lines.join("\n"));
    }

    const stats = await getStats(guild.id);
    const body = [
      `Busy at **${config.busyThreshold}** · up to **${config.maxExtras}** extras/base · **${config.cooldownSeconds}s** cooldown`,
      ...groups,
      `Created **${stats.creations}** · Removed **${stats.deletions}** · Peak **${stats.peakUsers}** concurrent`,
    ];

    return this.reply(
      interaction,
      ephemeralCard(makeInfoCard("🛋️ Multi Lounge", body)),
    );
  }
}
