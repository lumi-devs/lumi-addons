import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  getConfig,
  parseRouletteChoice,
  requireGuildId,
  resolveRoulette,
  spinRoulette,
  validateBet,
} from "../data.js";
import { rouletteHelpCard, rouletteResultCard } from "../ui.js";

export const rouletteCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("roulette")
    .setDescription("Spin the single-zero roulette wheel")
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName("bet")
        .setDescription("Amount to wager")
        .setMinValue(1)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("choice")
        .setDescription("red, black, odd, even, low, high, green, or 0-36")
        .setRequired(false),
    ),
  guildOnly: true,
  async execute(interaction, services) {
    const guildId = await requireGuildId(interaction, services);
    if (!guildId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const bet = interaction.options.getInteger("bet", true);
    const config = await getConfig(services, guildId);
    const invalid = validateBet(
      bet,
      config.rouletteMin,
      config.rouletteMax,
    );
    if (invalid) {
      await interaction.editReply(
        ephemeralCard(makeErrorCard("Invalid Bet", invalid)),
      );
      return;
    }

    const rawChoice = interaction.options.getString("choice");
    if (!rawChoice) {
      await interaction.editReply(rouletteHelpCard());
      return;
    }
    const choice = parseRouletteChoice(rawChoice);
    if (!choice) {
      await interaction.editReply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Choice",
            "Choose red, black, odd, even, low, high, green, or an exact number from 0 to 36.",
          ),
        ),
      );
      return;
    }

    const userId = interaction.user.id;
    const wager = BigInt(bet);
    const paid = await services.helpers.economy.debit(
      guildId,
      userId,
      wager,
      {
        ledger: { type: "roulette_bet", description: `Roulette ${choice.label}` },
      },
    );
    if (!paid) {
      await interaction.editReply(
        ephemeralCard(
          makeErrorCard(
            "Insufficient Funds",
            `You need ${bet.toLocaleString("en-US")} coins to place that bet.`,
          ),
        ),
      );
      return;
    }

    const landed = spinRoulette();
    const result = resolveRoulette(wager, choice, landed);
    if (result.payout > 0n) {
      await services.helpers.economy.credit(guildId, userId, result.payout, {
        ledger: {
          type: "roulette_payout",
          description: `Roulette ${choice.label}`,
        },
      });
    }

    await interaction.editReply(
      rouletteResultCard(wager, choice, landed, result.payout),
    );
  },
};