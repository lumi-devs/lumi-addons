import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import {
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "lumi/ui";
import {
  handLabel,
  handValue,
  type GameCard,
} from "./blackjack.js";
import { CRIME_TIERS } from "./crime.js";
import {
  rouletteBetLabel,
  ROULETTE_BET_TYPES,
  type RouletteBetType,
  type RouletteColor,
} from "./roulette.js";
import type { CurrencyConfig } from "./config.js";

const BET_EMOJI: Record<RouletteBetType, string> = {
  red: "🔴",
  black: "⚫",
  odd: "🔢",
  even: "🔢",
  low: "⬇️",
  high: "⬆️",
  green: "🟢",
  number: "🎯",
};

export function blackjackTableCard(
  player: GameCard[],
  dealer: GameCard[],
  bet: number,
  currency: CurrencyConfig,
  userId: string,
): CardReply {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`egbj:${userId}:hit`)
      .setLabel("Hit")
      .setEmoji({ name: "🃏" })
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`egbj:${userId}:stand`)
      .setLabel("Stand")
      .setEmoji({ name: "✋" })
      .setStyle(ButtonStyle.Secondary),
  );
  return makeInfoCard("🂡 Blackjack", [
    `Bet: **${currency.emoji} ${bet.toLocaleString("en-US")}**`,
    `**You (${handValue(player)}):** ${handLabel(player, false)}`,
    `**Dealer (?):** ${handLabel(dealer, true)}`,
  ].join("\n"), {
    footer: "Hit or stand — dealer stands on 17",
    actionRows: [row],
  });
}

export function roulettePickerCard(
  bet: number,
  target: number | null,
  currency: CurrencyConfig,
  userId: string,
): CardReply {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`egrl:${userId}`)
    .setPlaceholder("Pick your bet type")
    .addOptions(
      ROULETTE_BET_TYPES.map((type) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(
            type === "number" && target !== null
              ? `Number ${target}`
              : type === "number"
                ? "Exact number"
                : rouletteBetLabel(type, null),
          )
          .setValue(type)
          .setEmoji({ name: BET_EMOJI[type] })
          .setDescription(
            type === "green" || type === "number"
              ? "Pays 35 to 1"
              : "Pays 1 to 1",
          ),
      ),
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    select,
  );
  const lines = [
    `Bet: **${currency.emoji} ${bet.toLocaleString("en-US")}**`,
    target !== null
      ? `Exact number: **${target}** (pick it below for 35:1)`
      : "Pass a `number` option to enable the exact-number bet.",
  ];
  return makeInfoCard("🎡 Roulette", lines.join("\n"), {
    footer: "Single-zero wheel — pick a bet type to spin",
    actionRows: [row],
  });
}

export function rouletteSpinCard(
  shown: number,
  color: RouletteColor,
): CardReply {
  const dot = color === "red" ? "🔴" : color === "black" ? "⚫" : "🟢";
  return makeInfoCard("🎡 Roulette", `Ball bouncing… **${shown}** ${dot}`, {
    footer: "No more bets",
  });
}

export function crimePickerCard(userId: string): CardReply {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`egcr:${userId}`)
    .setPlaceholder("Pick your crime")
    .addOptions(
      CRIME_TIERS.map((tier) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(tier.label)
          .setValue(tier.id)
          .setEmoji({ name: tier.emoji })
          .setDescription(
            `${Math.round(tier.successRate * 100)}% · up to ${tier.payoutMax} · jail up to ${tier.jailMaxMinutes}m`.slice(0, 100),
          ),
      ),
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    select,
  );
  return makeWarningCard(
    "🌃 Crime",
    "Bigger scores, bigger risks. Fail and you pay a fine plus jail time.",
    {
      footer: "Jail blocks further crime until release",
      actionRows: [row],
    },
  );
}

export function settledWinCard(title: string, body: string): CardReply {
  return makeSuccessCard(title, body, { footer: "Settled on the ledger" });
}

export function settledLossCard(title: string, body: string): CardReply {
  return makeErrorCard(title, body, { footer: "Settled on the ledger" });
}
