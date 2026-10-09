import {
  deferUpdate,
  type InteractionContext,
} from "lumi/interactions";
import { getCurrency, getGamesConfig } from "../lib/config.js";
import {
  clearPending,
  loadPending,
  productionLedger,
  savePending,
} from "../lib/store.js";
import {
  handValue,
  isBust,
  type BlackjackState,
} from "../lib/blackjack.js";
import { settleBlackjack } from "../lib/settle.js";
import { blackjackTableCard, boardUpdate } from "../lib/ui.js";
import { BLACKJACK_KEY } from "../keys.js";

export default {
  prefix: "economy-games:blackjack",
  run: async (ctx: InteractionContext) => {
    const guildId = ctx.guildId;
    if (!guildId) return;
    const parts = ctx.customId.split(":");
    const userId = parts[2];
    const action = parts[3];
    if (!userId || (action !== "hit" && action !== "stand")) {
      await ctx.replyError("Blackjack", "That button is stale. Deal a fresh table with `/blackjack`.");
      return;
    }
    if (ctx.user.id !== userId) {
      await ctx.replyError(
        "Not Your Table",
        "That table belongs to someone else. Run `/blackjack` to deal your own.",
      );
      return;
    }
    const state = await loadPending<BlackjackState>(
      guildId,
      userId,
      BLACKJACK_KEY,
    );
    if (!state) {
      await ctx.replyError(
        "Table Expired",
        "That table is gone. Run `/blackjack` to deal a fresh one.",
      );
      return;
    }
    await deferUpdate();
    if (action === "hit") {
      const next = state.deck.pop();
      if (next) state.player.push(next);
      const config = await getGamesConfig(guildId);
      const currency = await getCurrency(guildId);
      if (isBust(state.player)) {
        await clearPending(guildId, userId, BLACKJACK_KEY);
        const settled = await settleBlackjack(
          productionLedger(),
          currency,
          guildId,
          userId,
          state,
          config.blackjackPayout,
        );
        await boardUpdate(settled.card);
        return;
      }
      if (handValue(state.player) === 21) {
        await stand(guildId, userId, state);
        return;
      }
      await savePending(guildId, userId, BLACKJACK_KEY, state, 300);
      await boardUpdate(
        blackjackTableCard(
          state.player,
          state.dealer,
          state.bet,
          currency,
          userId,
        ),
      );
      return;
    }
    await stand(guildId, userId, state);
  },
};

async function stand(
  guildId: string,
  userId: string,
  state: BlackjackState,
): Promise<void> {
  const config = await getGamesConfig(guildId);
  const currency = await getCurrency(guildId);
  await clearPending(guildId, userId, BLACKJACK_KEY);
  const settled = await settleBlackjack(
    productionLedger(),
    currency,
    guildId,
    userId,
    state,
    config.blackjackPayout,
  );
  await boardUpdate(settled.card);
}
