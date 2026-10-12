import type { StringSelectMenuInteraction } from "discord.js";
import { defineInteraction } from "@lumi-devs/lumi/interactions";
import { ephemeralCard, makeErrorCard } from "@lumi-devs/lumi/ui";
import type { Container } from "@lumi-devs/lumi/services";
import { formatDuration } from "@lumi-devs/lumi/time";
import { currencyName, deposit, withdraw } from "@lumi-devs/lumi/bank";
import { MODULE_NAME } from "../../utilities/Keys.js";
import { formatAmount, getGamesConfig } from "../../utilities/Config.js";
import {
  findCrimeTier,
  isJailed,
  resolveCrime,
} from "../../utilities/Crime.js";
import {
  claimCooldown,
  getJail,
  setJail,
} from "../../utilities/Store.js";
import { settledLossCard, settledWinCard } from "../../utilities/Ui.js";

export const crimeSelect = defineInteraction<StringSelectMenuInteraction>({
  prefix: `${MODULE_NAME}:crime`,
  kinds: ["select"],
  module: MODULE_NAME,
  async run(services: Container, interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.inGuild() || !interaction.guildId) return;
    const guildId = interaction.guildId;
    const parts = interaction.customId.split(":");
    const userId = parts[2];
    const crimeId = interaction.values[0];
    if (!userId || !crimeId) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Crime", "That menu is stale. Run `/crime` to plan a fresh scheme.")),
      );
      return;
    }
    if (interaction.user.id !== userId) {
      await interaction.reply(
        ephemeralCard(makeErrorCard(
          "Not Your Crime",
          "That scheme belongs to someone else. Run `/crime` to plan your own.",
        )),
      );
      return;
    }
    const jail = await getJail(services, guildId, userId);
    if (isJailed(jail)) {
      await interaction.reply(
        ephemeralCard(makeErrorCard(
          "Jailed",
          `Released <t:${Math.floor(jail!.until / 1000)}:R>.`,
        )),
      );
      return;
    }
    const config = await getGamesConfig(services, guildId);
    if (!(await claimCooldown(services, guildId, userId, "crime", config.crimeCooldownMs))) {
      await interaction.reply(
        ephemeralCard(makeErrorCard(
          "Lay Low",
          `The heat is on. Try again in ${formatDuration(config.crimeCooldownMs)}.`,
        )),
      );
      return;
    }
    const tier = findCrimeTier(crimeId);
    if (!tier) {
      await interaction.reply(ephemeralCard(makeErrorCard("Crime", "Unknown crime type.")));
      return;
    }
    await interaction.deferUpdate();
    const currency = { name: await currencyName(services, guildId), emoji: "🪙" };
    const outcome = resolveCrime(tier);
    if (outcome.success) {
      await deposit(services, guildId, userId, outcome.amount).catch(() => null);
      await interaction.editReply({
        ...settledWinCard(`${tier.emoji} ${tier.label} - Clean Getaway!`, [
          `Score: **${formatAmount(currency, outcome.amount)}**`,
        ].join("\n")),
      });
      return;
    }
    await withdraw(services, guildId, userId, outcome.amount).catch(() => null);
    const until = Date.now() + outcome.jailMinutes * 60 * 1000;
    await setJail(services, guildId, userId, {
      until,
      reason: `failed ${tier.label}`,
    });
    await interaction.editReply({
      ...settledLossCard(`${tier.emoji} ${tier.label} - Busted!`, [
        `Fine: **${formatAmount(currency, outcome.amount)}**`,
        `Sentence: **${outcome.jailMinutes} minutes** (out <t:${Math.floor(until / 1000)}:R>)`,
      ].join("\n")),
    });
  },
});
