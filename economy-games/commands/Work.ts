import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { formatDuration } from "@lumi-devs/lumi/time";
import { currencyName, getBalance } from "@lumi-devs/lumi/bank";
import { MODULE_NAME } from "../utilities/Keys.js";
import { formatAmount, getGamesConfig } from "../utilities/Config.js";
import { claimCooldown } from "../utilities/Store.js";
import { GRIND_DEFS, playGrind, type GrindKind } from "../utilities/Grinds.js";

export async function runGrindCommand(
  ctx: CommandContext,
  kind: GrindKind,
): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const config = await getGamesConfig(ctx.services, guildId);
  const def = GRIND_DEFS[kind];
  const cooldownMs =
    kind === "work"
      ? config.workCooldownMs
      : kind === "beg"
        ? config.begCooldownMs
        : kind === "fish"
          ? config.fishCooldownMs
          : config.mineCooldownMs;
  if (
    !(await claimCooldown(ctx.services, guildId, ctx.user.id, `grind-${kind}`, cooldownMs))
  ) {
    await ctx.replyError(
      def.label,
      `Take a breather. Try again in ${formatDuration(cooldownMs)}.`,
    );
    return;
  }
  const result = await playGrind(ctx.services, guildId, ctx.user.id, kind);
  const currency = {
    name: await currencyName(ctx.services, guildId),
    emoji: "🪙",
  };
  const lines = [
    result.flavor,
    `Earned: **${formatAmount(currency, result.amount + result.bonus)}**`,
  ];
  if (result.bonus > 0)
    lines.push(`Lucky break! Bonus: **${formatAmount(currency, result.bonus)}**`);
  if (result.credited < result.amount + result.bonus)
    lines.push("-# Capped at the server maximum.");
  const balance = await getBalance(ctx.services, guildId, ctx.user.id);
  lines.push(`Wallet: **${formatAmount(currency, balance.wallet)}**`);
  await ctx.replySuccess(`${def.emoji} ${def.label}`, lines.join("\n"), { ephemeral: false });
}

export const workDef: CommandDef = {
  name: "work",
  module: MODULE_NAME,
  description: "Work a shift for a steady paycheck.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () =>
    new SlashCommandBuilder()
      .setName("work")
      .setDescription("Work a shift for a steady paycheck."),
  run: async (ctx: CommandContext) => {
    await runGrindCommand(ctx, "work");
  },
};
