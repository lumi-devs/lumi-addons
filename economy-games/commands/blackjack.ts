import { randomUUID } from "node:crypto";
import type {
  CommandDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeInfoCard } from "@lumi/ui";
import {
  type ButtonInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type {
  BlackjackSettlement,
  BlackjackState,
} from "../data.js";
import {
  BlackjackExpiryMs,
  LockTtlMs,
  ModuleName,
  buildDeck,
  drawCard,
  getBlackjack,
  getConfig,
  handValue,
  isBlackjack,
  isBust,
  requireGuildId,
  saveBlackjack,
  settleBlackjack,
  shuffleDeck,
  takeBlackjack,
  userLockKey,
  validateBet,
  withLock,
} from "../data.js";
import { blackjackCard, blackjackSettlementCard } from "../ui.js";

type StartResult =
  | { kind: "busy" }
  | { kind: "insufficient" }
  | { kind: "settled"; state: BlackjackState; settlement: BlackjackSettlement }
  | { kind: "playing"; state: BlackjackState };

type ActionOutcome =
  | { kind: "missing" }
  | { kind: "stale" }
  | { kind: "expired"; state: BlackjackState }
  | { kind: "settled"; state: BlackjackState; settlement: BlackjackSettlement }
  | { kind: "playing"; state: BlackjackState };

export const blackjackCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play blackjack against the dealer")
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName("bet")
        .setDescription("Amount to wager")
        .setMinValue(1)
        .setRequired(true),
    ),
  guildOnly: true,
  async execute(interaction, services) {
    const guildId = await requireGuildId(interaction, services);
    if (!guildId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const bet = interaction.options.getInteger("bet", true);
    const config = await getConfig(services, guildId);
    const invalid = validateBet(
      bet,
      config.blackjackMin,
      config.blackjackMax,
    );
    if (invalid) {
      await interaction.editReply(
        ephemeralCard(makeErrorCard("Invalid Bet", invalid)),
      );
      return;
    }

    const userId = interaction.user.id;
    const result = await withLock(
      services,
      userLockKey("blackjack", guildId, userId),
      LockTtlMs,
      async (): Promise<StartResult> => {
        const existing = await getBlackjack(services, guildId, userId);
        if (existing) {
          if (existing.expiresAt > Date.now()) return { kind: "busy" };
          const expired = await takeBlackjack(services, guildId, userId);
          if (expired) {
            await services.helpers.economy.refund(
              guildId,
              userId,
              BigInt(expired.bet),
              {
                type: "blackjack_expired_refund",
                description: "Expired blackjack refund",
              },
            );
          }
        }

        const wager = BigInt(bet);
        const paid = await services.helpers.economy.debit(
          guildId,
          userId,
          wager,
          {
            ledger: {
              type: "blackjack_bet",
              description: "Blackjack bet",
            },
          },
        );
        if (!paid) return { kind: "insufficient" };

        try {
          const deck = shuffleDeck(buildDeck());
          const state: BlackjackState = {
            userId,
            bet,
            deck,
            player: [drawCard(deck), drawCard(deck)],
            dealer: [drawCard(deck), drawCard(deck)],
            expiresAt: Date.now() + BlackjackExpiryMs,
            nonce: randomUUID(),
          };

          if (isBlackjack(state.player)) {
            const settlement = await settleBlackjack(
              services,
              guildId,
              userId,
              state,
              config,
            );
            return { kind: "settled", state, settlement };
          }

          await saveBlackjack(services, guildId, state);
          return { kind: "playing", state };
        } catch (error) {
          await services.helpers.economy
            .refund(guildId, userId, wager, {
              type: "blackjack_refund",
              description: "Failed blackjack deal refund",
            })
            .catch(() => undefined);
          throw error;
        }
      },
    );

    if (!result) {
      await interaction.editReply(
        ephemeralCard(
          makeErrorCard("Blackjack", "The table is busy. Try again."),
        ),
      );
      return;
    }

    switch (result.kind) {
      case "busy":
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "Game In Progress",
              "Finish your current table or wait for it to expire.",
            ),
          ),
        );
        return;
      case "insufficient":
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "Insufficient Funds",
              `You need ${bet.toLocaleString("en-US")} coins to place that bet.`,
            ),
          ),
        );
        return;
      case "settled":
        await interaction.editReply(
          blackjackSettlementCard(result.state, result.settlement),
        );
        return;
      case "playing":
        await interaction.editReply(blackjackCard(result.state));
        return;
    }
  },
};

export async function handleBlackjackButton(
  interaction: ButtonInteraction,
  services: ModuleServices,
): Promise<void> {
  const parts = interaction.customId.split(":");
  const userId = parts[2];
  const action = parts[3];
  const nonce = parts[4];
  if (
    !userId ||
    !nonce ||
    (action !== "hit" && action !== "stand")
  ) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Blackjack", "That button is stale. Deal a new table."),
      ),
    );
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Server Only", "Blackjack only works inside a server."),
      ),
    );
    return;
  }
  if (!services.modules.isEnabled(guildId, ModuleName)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Module Disabled", "Economy Games is disabled here."),
      ),
    );
    return;
  }
  if (interaction.user.id !== userId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Not Your Table",
          "That table belongs to someone else. Deal your own with `/blackjack`.",
        ),
      ),
    );
    return;
  }

  await interaction.deferUpdate();

  const config = await getConfig(services, guildId);
  const outcome = await withLock(
    services,
    userLockKey("blackjack", guildId, userId),
    LockTtlMs,
    async (): Promise<ActionOutcome> => {
      const state = await takeBlackjack(services, guildId, userId);
      if (!state) return { kind: "missing" };

      if (state.expiresAt <= Date.now()) {
        await services.helpers.economy.refund(
          guildId,
          userId,
          BigInt(state.bet),
          {
            type: "blackjack_expired_refund",
            description: "Expired blackjack refund",
          },
        );
        return { kind: "expired", state };
      }

      if (state.nonce !== nonce) {
        await saveBlackjack(services, guildId, state);
        return { kind: "stale" };
      }

      if (action === "stand") {
        const settlement = await settleBlackjack(
          services,
          guildId,
          userId,
          state,
          config,
        );
        return { kind: "settled", state, settlement };
      }

      state.player.push(drawCard(state.deck));
      if (isBust(state.player) || handValue(state.player) === 21) {
        const settlement = await settleBlackjack(
          services,
          guildId,
          userId,
          state,
          config,
        );
        return { kind: "settled", state, settlement };
      }

      state.nonce = randomUUID();
      await saveBlackjack(services, guildId, state);
      return { kind: "playing", state };
    },
  );

  if (!outcome) {
    await interaction.followUp(
      ephemeralCard(
        makeErrorCard("Blackjack", "That action is already processing."),
      ),
    );
    return;
  }

  switch (outcome.kind) {
    case "missing":
      await interaction.followUp(
        ephemeralCard(
          makeErrorCard(
            "Table Expired",
            "That table is gone. Deal a fresh one with `/blackjack`.",
          ),
        ),
      );
      return;
    case "stale":
      await interaction.followUp(
        ephemeralCard(
          makeErrorCard(
            "Stale Action",
            "That button belongs to an earlier turn. Use the newest table.",
          ),
        ),
      );
      return;
    case "expired":
      await interaction.editReply(
        ephemeralCard(
          makeInfoCard("Blackjack Expired", [
            `Bet refunded — ${BigInt(outcome.state.bet).toLocaleString("en-US")} coins`,
            "The five-minute table limit was reached.",
          ]),
        ),
      );
      return;
    case "settled":
      await interaction.editReply(
        blackjackSettlementCard(outcome.state, outcome.settlement),
      );
      return;
    case "playing":
      await interaction.editReply(blackjackCard(outcome.state));
      return;
  }
}