import { defineCommand, type CommandContext } from "lumi/commands";
import { makeSuccessCard } from "lumi/ui";
import { formatDuration } from "lumi/utils";
import {
  formatAmount,
  getCurrency,
  getGamesConfig,
} from "../lib/config.js";
import { productionLedger } from "../lib/store.js";
import { GRIND_DEFS, playGrind, type GrindKind } from "../lib/grinds.js";
import { claimCooldown } from "../lib/store.js";

export async function runGrindCommand(
  ctx: CommandContext,
  kind: GrindKind,
): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const config = await getGamesConfig(guildId);
  const currency = await getCurrency(guildId);
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
    !(await claimCooldown(guildId, ctx.user.id, `grind-${kind}`, cooldownMs))
  ) {
    await ctx.replyError(
      def.label,
      `Take a breather. Try again in ${formatDuration(cooldownMs)}.`,
    );
    return;
  }
  const result = await playGrind(
    productionLedger(),
    currency,
    guildId,
    ctx.user.id,
    kind,
  );
  const lines = [
    result.flavor,
    `Earned: **${formatAmount(currency, result.amount)}**`,
  ];
  if (result.bonus > 0)
    lines.push(`🍀 Lucky break! Bonus: **${formatAmount(currency, result.bonus)}**`);
  if (result.credited < result.amount + result.bonus)
    lines.push("-# Capped at the server maximum.");
  lines.push(`Wallet: **${formatAmount(currency, result.balance.wallet)}**`);
  await ctx.reply(
    makeSuccessCard(`${def.emoji} ${def.label}`, lines.join("\n")),
    { ephemeral: false },
  );
}

export default defineCommand({
  name: "work",
  description: "Work a shift for a steady paycheck.",
  build: () => ({
    name: "work",
    description: "Work a shift for a steady paycheck.",
  }),
  run: async (ctx: CommandContext) => {
    await runGrindCommand(ctx, "work");
  },
});
