import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { time, TimestampStyles } from "@discordjs/formatters";
import type { StringSelectMenuInteraction } from "discord.js";
import { ephemeralCard, makeErrorCard } from "lumi/ui";
import { formatDuration } from "lumi/utils";
import {
  formatAmount,
  getCurrency,
  getGamesConfig,
} from "../lib/config.js";
import { creditCapped, productionLedger } from "../lib/ledger.js";
import {
  findCrimeTier,
  isJailed,
  resolveCrime,
} from "../lib/crime.js";
import {
  claimCooldown,
  getJail,
  setJail,
} from "../lib/store.js";
import { settledLossCard, settledWinCard } from "../lib/ui.js";
import { GamesKeys } from "../keys.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "economy-games-crime",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class CrimeSelectHandler extends InteractionHandler {
  public override parse(interaction: StringSelectMenuInteraction) {
    const parts = interaction.customId.split(":");
    if (parts[0] !== "egcr" || parts.length !== 2) return this.none();
    const value = interaction.values[0];
    if (!value) return this.none();
    return this.some({ userId: parts[1], crimeId: value });
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { userId: string; crimeId: string },
  ) {
    if (!interaction.inGuild() || !interaction.guildId) return;
    const guildId = interaction.guildId;
    if (interaction.user.id !== data.userId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Crime",
            "That scheme belongs to someone else. Run `/crime` to plan your own.",
          ),
        ),
      );
      return;
    }
    const jail = await getJail(guildId, data.userId);
    if (isJailed(jail)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Jailed",
            `Released ${time(new Date(jail!.until), TimestampStyles.RelativeTime)}.`,
          ),
        ),
      );
      return;
    }
    const config = await getGamesConfig(guildId);
    if (
      !(await claimCooldown(
        GamesKeys.cooldown("crime", guildId, data.userId),
        config.crimeCooldownMs,
      ))
    ) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Lay Low",
            `The heat is on. Try again in ${formatDuration(config.crimeCooldownMs)}.`,
          ),
        ),
      );
      return;
    }
    const tier = findCrimeTier(data.crimeId);
    if (!tier) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Crime", "Unknown crime type.")),
      );
      return;
    }
    await interaction.deferUpdate();
    const currency = await getCurrency(guildId);
    const ledger = productionLedger();
    const outcome = resolveCrime(tier);
    if (outcome.success) {
      const { balance, credited } = await creditCapped(
        ledger,
        currency,
        guildId,
        data.userId,
        outcome.amount,
        "games_crime_win",
        `${tier.id} success paid ${outcome.amount}`,
      );
      const cappedNote =
        credited < outcome.amount ? " *(capped at the server maximum)*" : "";
      await interaction.editReply(
        settledWinCard(`${tier.emoji} ${tier.label} — Clean Getaway!`, [
          `Score: **${formatAmount(currency, credited)}**${cappedNote}`,
          `Wallet: **${formatAmount(currency, balance.wallet)}**`,
        ].join("\n")),
      );
      return;
    }
    const balance = await ledger.ensureAccount(
      guildId,
      data.userId,
      currency.startingWallet,
      currency.startingBank,
    );
    const fine = Math.min(outcome.amount, balance.wallet);
    if (fine > 0) {
      await ledger.applyMutation({
        guildId,
        userId: data.userId,
        walletDelta: -fine,
        bankDelta: 0,
        kind: "games_crime_fine",
        reason: `${tier.id} failed, fined ${fine}`,
        startWallet: currency.startingWallet,
        startBank: currency.startingBank,
      });
    }
    const until = Date.now() + outcome.jailMinutes * 60 * 1000;
    await setJail(guildId, data.userId, {
      until,
      reason: `failed ${tier.label}`,
    });
    await interaction.editReply(
      settledLossCard(`${tier.emoji} ${tier.label} — Busted!`, [
        `Fine: **${formatAmount(currency, fine)}**`,
        `Sentence: **${outcome.jailMinutes} minutes** (out ${time(new Date(until), TimestampStyles.RelativeTime)})`,
      ].join("\n")),
    );
  }
}
