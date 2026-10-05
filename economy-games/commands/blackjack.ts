import { ApplyOptions } from "@sapphire/decorators";
import { BaseCommand, type CommandContext } from "lumi/commands";
import { getCurrency, getGamesConfig, validateBet } from "../lib/config.js";
import { debitBet, LedgerInsufficientFunds, productionLedger } from "../lib/ledger.js";
import {
  buildDeck,
  isBlackjack,
  shuffleDeck,
  type BlackjackState,
} from "../lib/blackjack.js";
import { settleBlackjack } from "../lib/settle.js";
import { clearPending, savePending } from "../lib/store.js";
import { blackjackTableCard } from "../lib/ui.js";
import { GamesKeys } from "../keys.js";

@ApplyOptions<BaseCommand.Options>({
  name: "blackjack",
  description: "Play blackjack against the dealer for wallet currency.",
  preconditions: ["GuildOnly"],
  prefixEnabled: true,
  cooldownLimit: 2,
  cooldownDelay: 5000,
})
export class BlackjackCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addIntegerOption((opt) =>
          opt
            .setName("bet")
            .setDescription("How much to bet.")
            .setMinValue(1)
            .setRequired(true),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const config = await getGamesConfig(guildId);
    const currency = await getCurrency(guildId);
    const bet = await ctx.getInteger("bet", { required: true });
    const invalid = validateBet(
      bet!,
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
        bet!,
        "games_blackjack_bid",
        `blackjack bid ${bet}`,
      );
    } catch (err) {
      if (err instanceof LedgerInsufficientFunds) {
        await ctx.replyError(
          "Blackjack",
          `You need ${bet!.toLocaleString("en-US")} in your wallet to place that bet.`,
        );
        return;
      }
      throw err;
    }
    const deck = shuffleDeck(buildDeck());
    const state: BlackjackState = {
      userId: ctx.user.id,
      bet: bet!,
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
      await clearPending(GamesKeys.blackjack(guildId, ctx.user.id));
      await ctx.reply(settled.card, { ephemeral: false });
      return;
    }
    await savePending(GamesKeys.blackjack(guildId, ctx.user.id), state, 300);
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
  }
}
