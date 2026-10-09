import {
  deferUpdate,
  type InteractionContext,
} from "lumi/interactions";
import { formatDuration, relativeTimestamp } from "lumi/utils";
import {
  formatAmount,
  getCurrency,
  getGamesConfig,
} from "../lib/config.js";
import { creditCapped } from "../lib/ledger.js";
import {
  findCrimeTier,
  isJailed,
  resolveCrime,
} from "../lib/crime.js";
import {
  claimCooldown,
  getJail,
  productionLedger,
  setJail,
} from "../lib/store.js";
import { boardUpdate, settledLossCard, settledWinCard } from "../lib/ui.js";

export default {
  prefix: "economy-games:crime",
  run: async (ctx: InteractionContext) => {
    const guildId = ctx.guildId;
    if (!guildId) return;
    const parts = ctx.customId.split(":");
    const userId = parts[2];
    const crimeId = ctx.values[0];
    if (!userId || !crimeId) {
      await ctx.replyError("Crime", "That menu is stale. Run `/crime` to plan a fresh scheme.");
      return;
    }
    if (ctx.user.id !== userId) {
      await ctx.replyError(
        "Not Your Crime",
        "That scheme belongs to someone else. Run `/crime` to plan your own.",
      );
      return;
    }
    const jail = await getJail(guildId, userId);
    if (isJailed(jail)) {
      await ctx.replyError(
        "Jailed",
        `Released ${relativeTimestamp(jail!.until)}.`,
      );
      return;
    }
    const config = await getGamesConfig(guildId);
    if (!(await claimCooldown(guildId, userId, "crime", config.crimeCooldownMs))) {
      await ctx.replyError(
        "Lay Low",
        `The heat is on. Try again in ${formatDuration(config.crimeCooldownMs)}.`,
      );
      return;
    }
    const tier = findCrimeTier(crimeId);
    if (!tier) {
      await ctx.replyError("Crime", "Unknown crime type.");
      return;
    }
    await deferUpdate();
    const currency = await getCurrency(guildId);
    const ledger = productionLedger();
    const outcome = resolveCrime(tier);
    if (outcome.success) {
      const { balance, credited } = await creditCapped(
        ledger,
        currency,
        guildId,
        userId,
        outcome.amount,
        "games_crime_win",
        `${tier.id} success paid ${outcome.amount}`,
      );
      const cappedNote =
        credited < outcome.amount ? " *(capped at the server maximum)*" : "";
      await boardUpdate(
        settledWinCard(`${tier.emoji} ${tier.label} — Clean Getaway!`, [
          `Score: **${formatAmount(currency, credited)}**${cappedNote}`,
          `Wallet: **${formatAmount(currency, balance.wallet)}**`,
        ].join("\n")),
      );
      return;
    }
    const balance = await ledger.ensureAccount(
      guildId,
      userId,
      currency.startingWallet,
      currency.startingBank,
    );
    const fine = Math.min(outcome.amount, balance.wallet);
    if (fine > 0) {
      await ledger.applyMutation({
        guildId,
        userId,
        walletDelta: -fine,
        bankDelta: 0,
        kind: "games_crime_fine",
        reason: `${tier.id} failed, fined ${fine}`,
        startWallet: currency.startingWallet,
        startBank: currency.startingBank,
      });
    }
    const until = Date.now() + outcome.jailMinutes * 60 * 1000;
    await setJail(guildId, userId, {
      until,
      reason: `failed ${tier.label}`,
    });
    await boardUpdate(
      settledLossCard(`${tier.emoji} ${tier.label} — Busted!`, [
        `Fine: **${formatAmount(currency, fine)}**`,
        `Sentence: **${outcome.jailMinutes} minutes** (out ${relativeTimestamp(until)})`,
      ].join("\n")),
    );
  },
};
