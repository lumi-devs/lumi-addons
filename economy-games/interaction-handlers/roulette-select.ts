import { setTimeout as sleep } from "node:timers/promises";
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { StringSelectMenuInteraction } from "discord.js";
import { ephemeralCard, makeErrorCard } from "lumi/ui";
import {
  formatAmount,
  getCurrency,
} from "../lib/config.js";
import {
  creditCapped,
  debitBet,
  LedgerInsufficientFunds,
  productionLedger,
} from "../lib/ledger.js";
import {
  resolveRouletteBet,
  ROULETTE_BET_TYPES,
  rouletteBetLabel,
  rouletteColor,
  spinRoulette,
  type RouletteBetType,
  type RoulettePending,
} from "../lib/roulette.js";
import { settledLossCard, settledWinCard } from "../lib/ui.js";
import { rouletteSpinCard } from "../lib/ui.js";
import { clearPending, loadPending } from "../lib/store.js";
import { GamesKeys } from "../keys.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "economy-games-roulette",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class RouletteSelectHandler extends InteractionHandler {
  public override parse(interaction: StringSelectMenuInteraction) {
    const parts = interaction.customId.split(":");
    if (parts[0] !== "egrl" || parts.length !== 2) return this.none();
    const value = interaction.values[0];
    if (!value || !(ROULETTE_BET_TYPES as readonly string[]).includes(value))
      return this.none();
    return this.some({ userId: parts[1], type: value as RouletteBetType });
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { userId: string; type: RouletteBetType },
  ) {
    if (!interaction.inGuild() || !interaction.guildId) return;
    const guildId = interaction.guildId;
    if (interaction.user.id !== data.userId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Spin",
            "That wheel belongs to someone else. Run `/roulette` to place your own bet.",
          ),
        ),
      );
      return;
    }
    const key = GamesKeys.roulette(guildId, data.userId);
    const pending = await loadPending<RoulettePending>(key);
    if (!pending) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Bet Expired",
            "That bet is gone. Run `/roulette` to place a fresh one.",
          ),
        ),
      );
      return;
    }
    if (data.type === "number" && pending.target === null) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Number Required",
            "Run `/roulette` again with the `number` option (0-36) to bet on an exact number.",
          ),
        ),
      );
      return;
    }
    await interaction.deferUpdate();
    await clearPending(key);
    const currency = await getCurrency(guildId);
    const ledger = productionLedger();
    try {
      await debitBet(
        ledger,
        currency,
        guildId,
        data.userId,
        pending.bet,
        "games_roulette_bid",
        `roulette bid ${pending.bet} on ${data.type}`,
      );
    } catch (err) {
      if (err instanceof LedgerInsufficientFunds) {
        await interaction.editReply(
          makeErrorCard(
            "Roulette",
            "You no longer have that bet in your wallet.",
          ),
        );
        return;
      }
      throw err;
    }
    const landed = spinRoulette();
    const first = spinRoulette();
    const second = spinRoulette();
    await interaction.editReply(
      rouletteSpinCard(first, rouletteColor(first)),
    );
    await sleep(650);
    await interaction.editReply(
      rouletteSpinCard(second, rouletteColor(second)),
    );
    await sleep(650);
    const result = resolveRouletteBet(
      data.type,
      landed,
      pending.target,
      pending.bet,
    );
    const dot =
      result.color === "red" ? "🔴" : result.color === "black" ? "⚫" : "🟢";
    const lines = [
      `Bet: **${formatAmount(currency, pending.bet)}** on **${rouletteBetLabel(data.type, pending.target)}**`,
      `Ball landed on **${result.number}** ${dot}`,
    ];
    if (!result.won) {
      await interaction.editReply(
        settledLossCard("🎡 No Win", [
          ...lines,
          `Lost: **${formatAmount(currency, pending.bet)}**`,
        ].join("\n")),
      );
      return;
    }
    const { credited } = await creditCapped(
      ledger,
      currency,
      guildId,
      data.userId,
      pending.bet + result.profit,
      "games_roulette_win",
      `roulette win bet ${pending.bet} on ${data.type} landed ${landed}`,
    );
    await interaction.editReply(
      settledWinCard("🎡 Winner!", [
        ...lines,
        `Won: **${formatAmount(currency, credited)}**`,
      ].join("\n")),
    );
  }
}
