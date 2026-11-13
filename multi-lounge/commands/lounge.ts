import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeWarningCard } from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getConfig, ModuleName, readStats } from "../data.js";
import { collectOccupancy, reconcileGuild } from "../lounge.js";
import { statsCard } from "../ui.js";

export const loungeCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("lounge")
    .setDescription("Inspect auto-scaling voice lounges")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription("Show per-base occupancy and lifetime lounge stats"),
    ),
  requiredPermit: "mod.*",
  async execute(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Server Only",
            "Lounge stats are only available inside a server.",
          ),
        ),
      );
      return;
    }

    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "Multi Lounge is disabled on this server.",
          ),
        ),
      );
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permission",
            "You need the **Manage Server** permission to view lounge stats.",
          ),
        ),
      );
      return;
    }

    await interaction.deferReply();
    const config = await getConfig(services, guildId);
    if (!config) {
      await interaction.editReply(
        ephemeralCard(
          makeErrorCard(
            "Config Unavailable",
            "I couldn't read the lounge settings right now. Try again in a moment.",
          ),
        ),
      );
      return;
    }
    if (config.baseChannelIds.length === 0) {
      await interaction.editReply(
        ephemeralCard(
          makeWarningCard(
            "Not Configured",
            "Add one or more base voice channels in the module settings first.",
          ),
        ),
      );
      return;
    }

    await reconcileGuild(services, guildId);
    const [occupancy, stats] = await Promise.all([
      collectOccupancy(services, guildId, config.baseChannelIds),
      readStats(services, guildId),
    ]);

    await interaction.editReply(statsCard(config, occupancy, stats));
  },
};