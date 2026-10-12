import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/lib/commands/CommandDef.js";
import type { CommandContext } from "@lumi-devs/lumi/lib/commands/Context.js";
import { currencyName, getBalance } from "@lumi-devs/lumi/lib/api/economy/Bank.js";
import { MODULE_NAME, ROULETTE_KEY } from "../utilities/Keys.js";
import { getGamesConfig, validateBet } from "../utilities/Config.js";
import { savePending } from "../utilities/Store.js";
import { roulettePickerCard } from "../utilities/Ui.js";
import type { RoulettePending } from "../utilities/Roulette.js";

export const rouletteDef: CommandDef = {
  name: "roulette",
  module: MODULE_NAME,
  description: "Bet on the roulette wheel, then pick a bet type.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () =>
    new SlashCommandBuilder()
      .setName("roulette")
      .setDescription("Bet on the roulette wheel, then pick a bet type.")
      .addIntegerOption((opt) =>
        opt
          .setName("bet")
          .setDescription("How much to bet.")
          .setMinValue(1)
          .setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName("number")
          .setDescription("Exact number for the number bet (0-36).")
          .setMinValue(0)
          .setMaxValue(36)
          .setRequired(false),
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
      await ctx.replyError("Roulette", "Tell me how much to bet.");
      return;
    }
    const number = await ctx.getInteger("number");
    const invalid = validateBet(bet, config.rouletteMinBet, config.rouletteMaxBet);
    if (invalid) {
      await ctx.replyError("Roulette", invalid);
      return;
    }
    const balance = await getBalance(ctx.services, guildId, ctx.user.id);
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
    await savePending(ctx.services, guildId, ctx.user.id, ROULETTE_KEY, pending);
    await ctx.reply(
      roulettePickerCard(bet, number, currency, ctx.user.id),
      { ephemeral: false },
    );
  },
};
