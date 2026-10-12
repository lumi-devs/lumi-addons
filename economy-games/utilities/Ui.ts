import { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { ButtonStyle } from "discord.js";
import {
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "@lumi-devs/lumi/lib/ui/Cards.js";
import { componentEmoji, row } from "@lumi-devs/lumi/lib/ui/Panels.js";
import {
  handLabel,
  handValue,
  type GameCard,
} from "./Blackjack.js";
import { CRIME_TIERS } from "./Crime.js";
import {
  rouletteBetLabel,
  ROULETTE_BET_TYPES,
  type RouletteBetType,
  type RouletteColor,
} from "./Roulette.js";
import type { CurrencyView } from "./Config.js";
import { MODULE_NAME } from "./Keys.js";

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
  currency: CurrencyView,
  userId: string,
): CardReply {
  return makeInfoCard("Blackjack", [
    `Bet: **${currency.emoji} ${bet.toLocaleString("en-US")}**`,
    `**You (${handValue(player)}):** ${handLabel(player, false)}`,
    `**Dealer (?):** ${handLabel(dealer, true)}`,
  ].join("\n"), {
    footer: "Hit or stand, dealer stands on 17",
    actionRows: [
      row(
        new ButtonBuilder()
          .setCustomId(`${MODULE_NAME}:blackjack:${userId}:hit`)
          .setLabel("Hit")
          .setEmoji(componentEmoji("🃏"))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${MODULE_NAME}:blackjack:${userId}:stand`)
          .setLabel("Stand")
          .setEmoji(componentEmoji("✋"))
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

export function roulettePickerCard(
  bet: number,
  target: number | null,
  currency: CurrencyView,
  userId: string,
): CardReply {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${MODULE_NAME}:roulette:${userId}`)
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
          .setDescription(
            type === "green" || type === "number"
              ? "Pays 35 to 1"
              : "Pays 1 to 1",
          )
          .setEmoji(componentEmoji(BET_EMOJI[type])),
      ),
    );
  return makeInfoCard("Roulette", [
    `Bet: **${currency.emoji} ${bet.toLocaleString("en-US")}**`,
    target !== null
      ? `Exact number: **${target}** (pick it below for 35:1)`
      : "Pass a `number` option to enable the exact-number bet.",
  ].join("\n"), {
    footer: "Single-zero wheel, pick a bet type to spin",
    actionRows: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    ],
  });
}

export function rouletteSpinCard(
  shown: number,
  color: RouletteColor,
): CardReply {
  const dot = color === "red" ? "🔴" : color === "black" ? "⚫" : "🟢";
  return makeInfoCard("Roulette", `Ball bouncing... **${shown}** ${dot}`, {
    footer: "No more bets",
  });
}

export function crimePickerCard(userId: string): CardReply {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${MODULE_NAME}:crime:${userId}`)
    .setPlaceholder("Pick your crime")
    .addOptions(
      CRIME_TIERS.map((tier) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(tier.label)
          .setValue(tier.id)
          .setDescription(
            `${Math.round(tier.successRate * 100)}% - up to ${tier.payoutMax} - jail up to ${tier.jailMaxMinutes}m`.slice(
              0,
              100,
            ),
          )
          .setEmoji(componentEmoji(tier.emoji)),
      ),
    );
  return makeWarningCard(
    "Crime",
    "Bigger scores, bigger risks. Fail and you pay a fine plus jail time.",
    {
      footer: "Jail blocks further crime until release",
      actionRows: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      ],
    },
  );
}

export function settledWinCard(title: string, body: string): CardReply {
  return makeSuccessCard(title, body, { footer: "Settled through the bank" });
}

export function settledLossCard(title: string, body: string): CardReply {
  return makeErrorCard(title, body, { footer: "Settled through the bank" });
}
