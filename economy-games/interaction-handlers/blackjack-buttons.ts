import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { ephemeralCard, makeErrorCard } from "lumi/ui";
import { getCurrency, getGamesConfig } from "../lib/config.js";
import { productionLedger } from "../lib/ledger.js";
import {
  handValue,
  isBust,
  type BlackjackState,
} from "../lib/blackjack.js";
import { settleBlackjack } from "../lib/settle.js";
import { clearPending, loadPending, savePending } from "../lib/store.js";
import { blackjackTableCard } from "../lib/ui.js";
import { GamesKeys } from "../keys.js";

interface Parsed {
  userId: string;
  action: "hit" | "stand";
}

@ApplyOptions<InteractionHandler.Options>({
  name: "economy-games-blackjack",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class BlackjackButtonHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    if (parts[0] !== "egbj" || parts.length !== 3) return this.none();
    const action = parts[2];
    if (action !== "hit" && action !== "stand") return this.none();
    return this.some({ userId: parts[1], action } as Parsed);
  }

  public async run(interaction: ButtonInteraction, data: Parsed) {
    if (!interaction.inGuild() || !interaction.guildId) return;
    const guildId = interaction.guildId;
    if (interaction.user.id !== data.userId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Table",
            "That table belongs to someone else. Run `/blackjack` to deal your own.",
          ),
        ),
      );
      return;
    }
    const key = GamesKeys.blackjack(guildId, data.userId);
    const state = await loadPending<BlackjackState>(key);
    if (!state) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Table Expired",
            "That table is gone. Run `/blackjack` to deal a fresh one.",
          ),
        ),
      );
      return;
    }
    await interaction.deferUpdate();
    const config = await getGamesConfig(guildId);
    const currency = await getCurrency(guildId);
    const ledger = productionLedger();
    if (data.action === "hit") {
      const next = state.deck.pop();
      if (next) state.player.push(next);
      if (isBust(state.player)) {
        await clearPending(key);
        const settled = await settleBlackjack(
          ledger,
          currency,
          guildId,
          data.userId,
          state,
          config.blackjackPayout,
        );
        await interaction.editReply(settled.card);
        return;
      }
      if (handValue(state.player) === 21) {
        await this.stand(interaction, guildId, data.userId, state, key);
        return;
      }
      await savePending(key, state, 300);
      await interaction.editReply(
        blackjackTableCard(
          state.player,
          state.dealer,
          state.bet,
          currency,
          data.userId,
        ),
      );
      return;
    }
    await this.stand(interaction, guildId, data.userId, state, key);
  }

  private async stand(
    interaction: ButtonInteraction,
    guildId: string,
    userId: string,
    state: BlackjackState,
    key: string,
  ): Promise<void> {
    const config = await getGamesConfig(guildId);
    const currency = await getCurrency(guildId);
    await clearPending(key);
    const settled = await settleBlackjack(
      productionLedger(),
      currency,
      guildId,
      userId,
      state,
      config.blackjackPayout,
    );
    await interaction.editReply(settled.card);
  }
}
