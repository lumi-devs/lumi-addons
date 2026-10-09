import { defineCommand, type CommandContext } from "lumi/commands";
import { getCurrency, getGamesConfig, validateBet } from "../lib/config.js";
import { productionLedger, savePending } from "../lib/store.js";
import { roulettePickerCard } from "../lib/ui.js";
import type { RoulettePending } from "../lib/roulette.js";
import { ROULETTE_KEY } from "../keys.js";

export default defineCommand({
  name: "roulette",
  description:
    "Bet on the roulette wheel, then pick red/black/odd/even/low/high/green/number.",
  build: () => ({
    name: "roulette",
    description:
      "Bet on the roulette wheel, then pick red/black/odd/even/low/high/green/number.",
    options: [
      {
        type: 4,
        name: "bet",
        description: "How much to bet.",
        required: true,
        min_value: 1,
      },
      {
        type: 4,
        name: "number",
        description: "Exact number for the number bet (0-36).",
        required: false,
        min_value: 0,
        max_value: 36,
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
      await ctx.replyError("Roulette", "Tell me how much to bet.");
      return;
    }
    const number = await ctx.getInteger("number");
    const invalid = validateBet(
      bet,
      config.rouletteMinBet,
      config.rouletteMaxBet,
    );
    if (invalid) {
      await ctx.replyError("Roulette", invalid);
      return;
    }
    const balance = await productionLedger().ensureAccount(
      guildId,
      ctx.user.id,
      currency.startingWallet,
      currency.startingBank,
    );
    if (balance.wallet < bet) {
      await ctx.replyError(
        "Roulette",
        `You need ${bet.toLocaleString("en-US")} in your wallet to place that bet.`,
      );
      return;
    }
    const pending: RoulettePending = {
      userId: ctx.user.id,
      bet,
      target: number,
    };
    await savePending(guildId, ctx.user.id, ROULETTE_KEY, pending, 300);
    await ctx.reply(
      roulettePickerCard(bet, number, currency, ctx.user.id),
      { ephemeral: false },
    );
  },
});
