import type { StringSelectMenuInteraction } from "discord.js";
import { defineInteraction } from "#src/lib/interactions/InteractionDef.js";
import { ephemeralCard, makeErrorCard } from "#src/lib/ui/Cards.js";
import type { Container } from "#src/lib/Services.js";
import { currencyName, deposit } from "#src/lib/api/economy/Bank.js";
import { MODULE_NAME, ROULETTE_KEY } from "../../utilities/Keys.js";
import { formatAmount } from "../../utilities/Config.js";
import { LedgerInsufficientFunds, debitBet } from "../../utilities/Ledger.js";
import {
  resolveRouletteBet,
  ROULETTE_BET_TYPES,
  rouletteBetLabel,
  rouletteColor,
  spinRoulette,
  type RouletteBetType,
  type RoulettePending,
} from "../../utilities/Roulette.js";
import { rouletteSpinCard, settledLossCard, settledWinCard } from "../../utilities/Ui.js";
import { clearPending, loadPending } from "../../utilities/Store.js";

export const rouletteSelect = defineInteraction<StringSelectMenuInteraction>({
  prefix: `${MODULE_NAME}:roulette`,
  kinds: ["select"],
  module: MODULE_NAME,
  async run(services: Container, interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.inGuild() || !interaction.guildId) return;
    const guildId = interaction.guildId;
    const parts = interaction.customId.split(":");
    const userId = parts[2];
    const type = interaction.values[0] as RouletteBetType | undefined;
    if (
      !userId ||
      !type ||
      !(ROULETTE_BET_TYPES as readonly string[]).includes(type)
    ) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Roulette", "That wheel is stale. Run `/roulette` to place a fresh bet.")),
      );
      return;
    }
    if (interaction.user.id !== userId) {
      await interaction.reply(
        ephemeralCard(makeErrorCard(
          "Not Your Spin",
          "That wheel belongs to someone else. Run `/roulette` to place your own bet.",
        )),
      );
      return;
    }
    const pending = await loadPending<RoulettePending>(services, guildId, userId, ROULETTE_KEY);
    if (!pending) {
      await interaction.reply(
        ephemeralCard(makeErrorCard(
          "Bet Expired",
          "That bet is gone. Run `/roulette` to place a fresh one.",
        )),
      );
      return;
    }
    if (type === "number" && pending.target === null) {
      await interaction.reply(
        ephemeralCard(makeErrorCard(
          "Number Required",
          "Run `/roulette` again with the `number` option (0-36) to bet on an exact number.",
        )),
      );
      return;
    }
    await interaction.deferUpdate();
    await clearPending(services, guildId, userId, ROULETTE_KEY);
    const currency = { name: await currencyName(services, guildId), emoji: "🪙" };
    try {
      await debitBet(services, guildId, userId, pending.bet);
    } catch (err) {
      if (err instanceof LedgerInsufficientFunds) {
        await interaction.editReply({
          ...makeErrorCard("Roulette", "You no longer have that bet in your wallet."),
        });
        return;
      }
      throw err;
    }
    const landed = spinRoulette();
    const first = spinRoulette();
    await interaction.editReply({ ...rouletteSpinCard(first, rouletteColor(first)) });
    await new Promise((resolve) => setTimeout(resolve, 650));
    const result = resolveRouletteBet(type, landed, pending.target, pending.bet);
    const dot =
      result.color === "red" ? "🔴" : result.color === "black" ? "⚫" : "🟢";
    const lines = [
      `Bet: **${formatAmount(currency, pending.bet)}** on **${rouletteBetLabel(type, pending.target)}**`,
      `Ball landed on **${result.number}** ${dot}`,
    ];
    if (!result.won) {
      await interaction.editReply({
        ...settledLossCard("No Win", [
          ...lines,
          `Lost: **${formatAmount(currency, pending.bet)}**`,
        ].join("\n")),
      });
      return;
    }
    await deposit(services, guildId, userId, pending.bet + result.profit).catch(() => null);
    await interaction.editReply({
      ...settledWinCard("Winner!", [
        ...lines,
        `Won: **${formatAmount(currency, pending.bet + result.profit)}**`,
      ].join("\n")),
    });
  },
});
