import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { currencyName } from "@lumi-devs/lumi/bank";
import { BLACKJACK_KEY, MODULE_NAME } from "../utilities/Keys.js";
import { getGamesConfig, validateBet } from "../utilities/Config.js";
import { debitBet, LedgerInsufficientFunds } from "../utilities/Ledger.js";
import { clearPending, savePending } from "../utilities/Store.js";
import {
  buildDeck,
  isBlackjack,
  shuffleDeck,
  type BlackjackState,
} from "../utilities/Blackjack.js";
import { settleBlackjack } from "../utilities/Settle.js";
import { blackjackTableCard } from "../utilities/Ui.js";

export const blackjackDef: CommandDef = {
  name: "blackjack",
  module: MODULE_NAME,
  description: "Play blackjack against the dealer for wallet currency.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () =>
    new SlashCommandBuilder()
      .setName("blackjack")
      .setDescription("Play blackjack against the dealer for wallet currency.")
      .addIntegerOption((opt) =>
        opt
          .setName("bet")
          .setDescription("How much to bet.")
          .setMinValue(1)
          .setRequired(true),
      ) as SlashCommandBuilder,
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.replyError("Guild Only", "This command only works inside a server.");
      return;
    }
    const config = await getGamesConfig(ctx.services, guildId);
    const currency = { name: await currencyName(ctx.services, guildId), emoji: "🪙" };
    const bet = await ctx.getInteger("bet", { required: true });
    if (bet === null) {
      await ctx.replyError("Blackjack", "Tell me how much to bet.");
      return;
    }
    const invalid = validateBet(bet, config.blackjackMinBet, config.blackjackMaxBet);
    if (invalid) {
      await ctx.replyError("Blackjack", invalid);
      return;
    }
    try {
      await debitBet(ctx.services, guildId, ctx.user.id, bet);
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
        ctx.services,
        currency,
        guildId,
        ctx.user.id,
        state,
        config.blackjackPayout,
      );
      await clearPending(ctx.services, guildId, ctx.user.id, BLACKJACK_KEY);
      await ctx.reply(settled.card, { ephemeral: false });
      return;
    }
    await savePending(ctx.services, guildId, ctx.user.id, BLACKJACK_KEY, state);
    await ctx.reply(
      blackjackTableCard(state.player, state.dealer, state.bet, currency, ctx.user.id),
      { ephemeral: false },
    );
  },
};
