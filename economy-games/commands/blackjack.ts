import { defineCommand, type CommandContext } from "lumi/commands";
import { getCurrency, getGamesConfig, validateBet } from "../lib/config.js";
import { debitBet, LedgerInsufficientFunds } from "../lib/ledger.js";
import {
  clearPending,
  productionLedger,
  savePending,
} from "../lib/store.js";
import {
  buildDeck,
  isBlackjack,
  shuffleDeck,
  type BlackjackState,
} from "../lib/blackjack.js";
import { settleBlackjack } from "../lib/settle.js";
import { blackjackTableCard } from "../lib/ui.js";
import { BLACKJACK_KEY } from "../keys.js";

export default defineCommand({
  name: "blackjack",
  description: "Play blackjack against the dealer for wallet currency.",
  build: () => ({
    name: "blackjack",
    description: "Play blackjack against the dealer for wallet currency.",
    options: [
      {
        type: 4,
        name: "bet",
        description: "How much to bet.",
        required: true,
        min_value: 1,
      },
    ],
  }),
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.replyError("Guild Only", "This command only works inside a server.");
      return;
    }
    const config = await getGamesConfig(guildId);
    const currency = await getCurrency(guildId);
    const bet = await ctx.getInteger("bet", { required: true });
    if (bet === null) {
      await ctx.replyError("Blackjack", "Tell me how much to bet.");
      return;
    }
    const invalid = validateBet(
      bet,
      config.blackjackMinBet,
      config.blackjackMaxBet,
    );
    if (invalid) {
      await ctx.replyError("Blackjack", invalid);
      return;
    }
    const ledger = productionLedger();
    try {
      await debitBet(
        ledger,
        currency,
        guildId,
        ctx.user.id,
        bet,
        "games_blackjack_bid",
        `blackjack bid ${bet}`,
      );
    } catch (err) {
      if (err instanceof LedgerInsufficientFunds) {
        await ctx.replyError(
          "Blackjack",
          `You need ${bet.toLocaleString("en-US")} in your wallet to place that bet.`,
        );
        return;
      }
      throw err;
    }
    const deck = shuffleDeck(buildDeck());
    const state: BlackjackState = {
      userId: ctx.user.id,
      bet,
      deck,
      player: [deck.pop()!, deck.pop()!],
      dealer: [deck.pop()!, deck.pop()!],
    };
    if (isBlackjack(state.player)) {
      const settled = await settleBlackjack(
        ledger,
        currency,
        guildId,
        ctx.user.id,
        state,
        config.blackjackPayout,
      );
      await clearPending(guildId, ctx.user.id, BLACKJACK_KEY);
      await ctx.reply(settled.card, { ephemeral: false });
      return;
    }
    await savePending(guildId, ctx.user.id, BLACKJACK_KEY, state, 300);
    await ctx.reply(
      blackjackTableCard(
        state.player,
        state.dealer,
        state.bet,
        currency,
        ctx.user.id,
      ),
      { ephemeral: false },
    );
  },
});
