import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeWarningCard } from "@lumi/ui";
import { SlashCommandBuilder } from "discord.js";
import { ModuleName, readConfig } from "../config.js";
import { authorHashFor, isBanned, onCooldown } from "../data.js";
import { buildConfessModal } from "../ui.js";

export const confessCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("confess")
    .setDescription("Submit an anonymous confession.")
    .setDMPermission(false),
  guildOnly: true,
  async execute(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Confessions can only be used in a server."),
        ),
      );
      return;
    }
    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "The Confessions module is disabled on this server.",
          ),
        ),
      );
      return;
    }

    const config = await readConfig(services, guildId);
    if (!config.confessionChannelId) {
      await interaction.reply(
        ephemeralCard(
          makeWarningCard(
            "Not Configured",
            "An administrator needs to choose a confession channel first.",
          ),
        ),
      );
      return;
    }

    const channel = await services.client.channels
      .fetch(config.confessionChannelId)
      .catch(() => null);
    if (!channel?.isSendable()) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Channel Unavailable",
            "The confession channel is missing or I cannot send messages there.",
          ),
        ),
      );
      return;
    }

    const authorHash = await authorHashFor(
      services,
      guildId,
      interaction.user.id,
    );
    if (await isBanned(services, guildId, authorHash)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Blocked",
            "You can no longer submit confessions in this server.",
          ),
        ),
      );
      return;
    }
    if (await onCooldown(services, guildId, authorHash)) {
      await interaction.reply(
        ephemeralCard(
          makeWarningCard(
            "Slow Down",
            `Please wait before your next confession (cooldown: ${config.cooldownMinutes} minute${config.cooldownMinutes === 1 ? "" : "s"}).`,
          ),
        ),
      );
      return;
    }

    await interaction.showModal(buildConfessModal(config.allowImages));
  },
};
