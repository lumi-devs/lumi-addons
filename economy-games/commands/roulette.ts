import { ApplyOptions } from "@sapphire/decorators";
import { BaseCommand, type CommandContext } from "lumi/commands";
import { getCurrency, getGamesConfig, validateBet } from "../lib/config.js";
import { productionLedger } from "../lib/ledger.js";
import { savePending } from "../lib/store.js";
import { roulettePickerCard } from "../lib/ui.js";
import type { RoulettePending } from "../lib/roulette.js";
import { GamesKeys } from "../keys.js";

@ApplyOptions<BaseCommand.Options>({
  name: "roulette",
  description:
    "Bet on the roulette wheel, then pick red/black/odd/even/low/high/green/number.",
  preconditions: ["GuildOnly"],
  prefixEnabled: true,
  cooldownLimit: 2,
  cooldownDelay: 5000,
})
export class RouletteCommand extends BaseCommand {
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
        )
        .addIntegerOption((opt) =>
          opt
            .setName("number")
            .setDescription("Exact number for the number bet (0-36).")
            .setMinValue(0)
            .setMaxValue(36)
            .setRequired(false),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const config = await getGamesConfig(guildId);
    const currency = await getCurrency(guildId);
    const bet = await ctx.getInteger("bet", { required: true });
    const number = await ctx.getInteger("number");
    const invalid = validateBet(
      bet!,
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
    if (balance.wallet < bet!) {
      await ctx.replyError(
        "Roulette",
        `You need ${bet!.toLocaleString("en-US")} in your wallet to place that bet.`,
      );
      return;
    }
    const pending: RoulettePending = {
      userId: ctx.user.id,
      bet: bet!,
      target: number,
    };
    await savePending(GamesKeys.roulette(guildId, ctx.user.id), pending, 300);
    await ctx.reply(
      roulettePickerCard(bet!, number, currency, ctx.user.id),
      { ephemeral: false },
    );
  }
}
