import { editReply } from "lumi/interactions";
import {
  actionRow,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  selectRow,
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

export function boardUpdate(card: CardReply): Promise<void> {
  return editReply({ components: card.components.map((c) => c.toJSON()) });
}

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
  return makeInfoCard("🂡 Blackjack", [
    `Bet: **${currency.emoji} ${bet.toLocaleString("en-US")}**`,
    `**You (${handValue(player)}):** ${handLabel(player, false)}`,
    `**Dealer (?):** ${handLabel(dealer, true)}`,
  ].join("\n"), {
    footer: "Hit or stand — dealer stands on 17",
    actionRows: [
      actionRow([
        {
          customId: `economy-games:blackjack:${userId}:hit`,
          label: "Hit",
          emoji: "🃏",
        },
        {
          customId: `economy-games:blackjack:${userId}:stand`,
          label: "Stand",
          emoji: "✋",
        },
      ]),
    ],
  });
}

export function roulettePickerCard(
  bet: number,
  target: number | null,
  currency: CurrencyConfig,
  userId: string,
): CardReply {
  return makeInfoCard("🎡 Roulette", [
    `Bet: **${currency.emoji} ${bet.toLocaleString("en-US")}**`,
    target !== null
      ? `Exact number: **${target}** (pick it below for 35:1)`
      : "Pass a `number` option to enable the exact-number bet.",
  ].join("\n"), {
    footer: "Single-zero wheel — pick a bet type to spin",
    actionRows: [
      selectRow({
        customId: `economy-games:roulette:${userId}`,
        placeholder: "Pick your bet type",
        options: ROULETTE_BET_TYPES.map((type) => ({
          label:
            type === "number" && target !== null
              ? `Number ${target}`
              : type === "number"
                ? "Exact number"
                : rouletteBetLabel(type, null),
          value: type,
          description:
            type === "green" || type === "number"
              ? "Pays 35 to 1"
              : "Pays 1 to 1",
          emoji: BET_EMOJI[type],
        })),
      }),
    ],
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
  return makeWarningCard(
    "🌃 Crime",
    "Bigger scores, bigger risks. Fail and you pay a fine plus jail time.",
    {
      footer: "Jail blocks further crime until release",
      actionRows: [
        selectRow({
          customId: `economy-games:crime:${userId}`,
          placeholder: "Pick your crime",
          options: CRIME_TIERS.map((tier) => ({
            label: tier.label,
            value: tier.id,
            description:
              `${Math.round(tier.successRate * 100)}% · up to ${tier.payoutMax} · jail up to ${tier.jailMaxMinutes}m`.slice(
                0,
                100,
              ),
            emoji: tier.emoji,
          })),
        }),
      ],
    },
  );
}

export function settledWinCard(title: string, body: string): CardReply {
  return makeSuccessCard(title, body, { footer: "Settled on the ledger" });
}

export function settledLossCard(title: string, body: string): CardReply {
  return makeErrorCard(title, body, { footer: "Settled on the ledger" });
}
