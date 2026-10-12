import type { ButtonInteraction } from "discord.js";
import { defineInteraction } from "@lumi-devs/lumi/interactions";
import { ephemeralCard, makeErrorCard } from "@lumi-devs/lumi/ui";
import type { Container } from "@lumi-devs/lumi/services";
import { currencyName } from "@lumi-devs/lumi/bank";
import { BLACKJACK_KEY, MODULE_NAME } from "../../utilities/Keys.js";
import { getGamesConfig } from "../../utilities/Config.js";
import {
  clearPending,
  loadPending,
  savePending,
} from "../../utilities/Store.js";
import {
  handValue,
  isBust,
  type BlackjackState,
} from "../../utilities/Blackjack.js";
import { settleBlackjack } from "../../utilities/Settle.js";
import { blackjackTableCard } from "../../utilities/Ui.js";

async function stand(
  services: Container,
  guildId: string,
  userId: string,
  state: BlackjackState,
  interaction: ButtonInteraction,
): Promise<void> {
  const config = await getGamesConfig(services, guildId);
  const currency = { name: await currencyName(services, guildId), emoji: "🪙" };
  await clearPending(services, guildId, userId, BLACKJACK_KEY);
  const settled = await settleBlackjack(services, currency, guildId, userId, state, config.blackjackPayout);
  await interaction.editReply({ ...settled.card });
}

export const blackjackButtons = defineInteraction<ButtonInteraction>({
  prefix: `${MODULE_NAME}:blackjack`,
  kinds: ["button"],
  module: MODULE_NAME,
  async run(services: Container, interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) return;
    const guildId = interaction.guildId;
    const parts = interaction.customId.split(":");
    const userId = parts[2];
    const action = parts[3];
    if (!userId || (action !== "hit" && action !== "stand")) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Blackjack", "That button is stale. Deal a fresh table with `/blackjack`.")),
      );
      return;
    }
    if (interaction.user.id !== userId) {
      await interaction.reply(
        ephemeralCard(makeErrorCard(
          "Not Your Table",
          "That table belongs to someone else. Run `/blackjack` to deal your own.",
        )),
      );
      return;
    }
    const state = await loadPending<BlackjackState>(services, guildId, userId, BLACKJACK_KEY);
    if (!state) {
      await interaction.reply(
        ephemeralCard(makeErrorCard(
          "Table Expired",
          "That table is gone. Run `/blackjack` to deal a fresh one.",
        )),
      );
      return;
    }
    await interaction.deferUpdate();
    if (action === "hit") {
      const next = state.deck.pop();
      if (next) state.player.push(next);
      const config = await getGamesConfig(services, guildId);
      const currency = { name: await currencyName(services, guildId), emoji: "🪙" };
      if (isBust(state.player)) {
        await clearPending(services, guildId, userId, BLACKJACK_KEY);
        const settled = await settleBlackjack(services, currency, guildId, userId, state, config.blackjackPayout);
        await interaction.editReply({ ...settled.card });
        return;
      }
      if (handValue(state.player) === 21) {
        await stand(services, guildId, userId, state, interaction);
        return;
      }
      await savePending(services, guildId, userId, BLACKJACK_KEY, state);
      await interaction.editReply({
        ...blackjackTableCard(state.player, state.dealer, state.bet, currency, userId),
      });
      return;
    }
    await stand(services, guildId, userId, state, interaction);
  },
});
