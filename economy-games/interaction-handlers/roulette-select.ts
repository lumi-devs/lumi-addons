import { setTimeout as sleep } from "node:timers/promises";
import {
  deferUpdate,
  type InteractionContext,
} from "lumi/interactions";
import { makeErrorCard } from "lumi/ui";
import { formatAmount, getCurrency } from "../lib/config.js";
import {
  creditCapped,
  debitBet,
  LedgerInsufficientFunds,
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
import { boardUpdate, settledLossCard, settledWinCard } from "../lib/ui.js";
import { rouletteSpinCard } from "../lib/ui.js";
import { clearPending, loadPending, productionLedger } from "../lib/store.js";
import { ROULETTE_KEY } from "../keys.js";

export default {
  prefix: "economy-games:roulette",
  run: async (ctx: InteractionContext) => {
    const guildId = ctx.guildId;
    if (!guildId) return;
    const parts = ctx.customId.split(":");
    const userId = parts[2];
    const type = ctx.values[0] as RouletteBetType | undefined;
    if (
      !userId ||
      !type ||
      !(ROULETTE_BET_TYPES as readonly string[]).includes(type)
    ) {
      await ctx.replyError("Roulette", "That wheel is stale. Run `/roulette` to place a fresh bet.");
      return;
    }
    if (ctx.user.id !== userId) {
      await ctx.replyError(
        "Not Your Spin",
        "That wheel belongs to someone else. Run `/roulette` to place your own bet.",
      );
      return;
    }
    const pending = await loadPending<RoulettePending>(
      guildId,
      userId,
      ROULETTE_KEY,
    );
    if (!pending) {
      await ctx.replyError(
        "Bet Expired",
        "That bet is gone. Run `/roulette` to place a fresh one.",
      );
      return;
    }
    if (type === "number" && pending.target === null) {
      await ctx.replyError(
        "Number Required",
        "Run `/roulette` again with the `number` option (0-36) to bet on an exact number.",
      );
      return;
    }
    await deferUpdate();
    await clearPending(guildId, userId, ROULETTE_KEY);
    const currency = await getCurrency(guildId);
    const ledger = productionLedger();
    try {
      await debitBet(
        ledger,
        currency,
        guildId,
        userId,
        pending.bet,
        "games_roulette_bid",
        `roulette bid ${pending.bet} on ${type}`,
      );
    } catch (err) {
      if (err instanceof LedgerInsufficientFunds) {
        await boardUpdate(
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
    await boardUpdate(rouletteSpinCard(first, rouletteColor(first)));
    await sleep(650);
    await boardUpdate(rouletteSpinCard(second, rouletteColor(second)));
    await sleep(650);
    const result = resolveRouletteBet(
      type,
      landed,
      pending.target,
      pending.bet,
    );
    const dot =
      result.color === "red" ? "🔴" : result.color === "black" ? "⚫" : "🟢";
    const lines = [
      `Bet: **${formatAmount(currency, pending.bet)}** on **${rouletteBetLabel(type, pending.target)}**`,
      `Ball landed on **${result.number}** ${dot}`,
    ];
    if (!result.won) {
      await boardUpdate(
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
      userId,
      pending.bet + result.profit,
      "games_roulette_win",
      `roulette win bet ${pending.bet} on ${type} landed ${landed}`,
    );
    await boardUpdate(
      settledWinCard("🎡 Winner!", [
        ...lines,
        `Won: **${formatAmount(currency, credited)}**`,
      ].join("\n")),
    );
  },
};
