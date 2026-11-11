import type { CardReply } from "@lumi/ui";
import {
  createActionButton,
  createStringSelectMenu,
  formatPageFooter,
  formatTimestamp,
  makeErrorCard,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import { ButtonStyle } from "discord.js";
import type {
  BlackjackSettlement,
  BlackjackState,
  CrimeOutcome,
  GrindDefinition,
  GrindOutcome,
  RouletteBet,
  ShopItem,
} from "./data.js";
import {
  CrimeTiers,
  ModuleName,
  formatMoney,
  handLabel,
  handValue,
  rouletteColor,
} from "./data.js";

export function blackjackCard(state: BlackjackState): CardReply {
  const playerValue = handValue(state.player);
  const lines = [
    `**Bet** — ${formatMoney(BigInt(state.bet))}`,
    `**You (${playerValue})** — ${handLabel(state.player, false)}`,
    `**Dealer** — ${handLabel(state.dealer, true)}`,
  ];
  const hit = createActionButton({
    customId: `${ModuleName}:blackjack:${state.userId}:hit:${state.nonce}`,
    label: "Hit",
    emoji: "🃏",
    style: ButtonStyle.Primary,
  });
  const stand = createActionButton({
    customId: `${ModuleName}:blackjack:${state.userId}:stand:${state.nonce}`,
    label: "Stand",
    emoji: "✋",
    style: ButtonStyle.Secondary,
  });
  return makeInfoCard("Blackjack", lines, {
    footer: "Dealer stands on 17",
    actionRows: [row(hit, stand)],
  });
}

function blackjackTitle(settlement: BlackjackSettlement): string {
  switch (settlement.outcome) {
    case "playerBlackjack":
      return "Natural Blackjack";
    case "playerWin":
    case "dealerBust":
      return "You Win";
    case "push":
      return "Push";
    case "dealerWin":
    case "playerBust":
      return "Dealer Wins";
  }
}

export function blackjackSettlementCard(
  state: BlackjackState,
  settlement: BlackjackSettlement,
): CardReply {
  const lines = [
    `**Bet** — ${formatMoney(settlement.bet)}`,
    `**You (${settlement.playerValue})** — ${handLabel(state.player, false)}`,
    `**Dealer (${settlement.dealerValue})** — ${handLabel(settlement.dealer, false)}`,
  ];
  const title = blackjackTitle(settlement);
  if (settlement.outcome === "push") {
    return makeInfoCard(title, [
      ...lines,
      `Refunded — ${formatMoney(settlement.credited)}`,
    ]);
  }
  if (settlement.credited > 0n) {
    return makeSuccessCard(title, [
      ...lines,
      `Returned — ${formatMoney(settlement.credited)}`,
      `Net — +${formatMoney(settlement.net)}`,
    ]);
  }
  return makeErrorCard(title, [
    ...lines,
    `Lost — ${formatMoney(settlement.bet)}`,
  ]);
}

export function rouletteHelpCard(): CardReply {
  return makeInfoCard(
    "Roulette",
    [
      "Provide a `choice` to spin.",
      "**Even money** — red, black, odd, even, low (1-18), high (19-36)",
      "**35:1** — green (0) or an exact number from 0 to 36",
      "Example: `/roulette bet:50 choice:17`",
    ],
    { footer: "Single-zero wheel · even-money chances return 2x stake" },
  );
}

export function rouletteResultCard(
  bet: bigint,
  choice: RouletteBet,
  landed: number,
  payout: bigint,
): CardReply {
  const color = rouletteColor(landed);
  const dot = color === "red" ? "🔴" : color === "black" ? "⚫" : "🟢";
  const lines = [
    `**Bet** — ${formatMoney(bet)} on **${choice.label}**`,
    `**Ball** — ${landed} ${dot}`,
  ];
  if (payout > 0n) {
    return makeSuccessCard("Roulette — Win", [
      ...lines,
      `Returned — ${formatMoney(payout)}`,
      `Net — +${formatMoney(payout - bet)}`,
    ]);
  }
  return makeErrorCard("Roulette — No Win", [
    ...lines,
    `Lost — ${formatMoney(bet)}`,
  ]);
}

export function crimePickerCard(userId: string): CardReply {
  const menu = createStringSelectMenu({
    customId: `${ModuleName}:crime:${userId}`,
    placeholder: "Choose a crime",
    options: CrimeTiers.map((tier) => ({
      label: tier.label,
      value: tier.id,
      description: `${Math.round(tier.successRate * 100)}% success · ${formatMoney(BigInt(tier.payoutMin))} to ${formatMoney(BigInt(tier.payoutMax))}`,
      emoji: tier.emoji,
    })),
  });
  return makeWarningCard(
    "Crime",
    "Bigger scores carry bigger risk. A failed job lands you in jail.",
    {
      footer: "Jail blocks further crimes until release",
      actionRows: [row(menu)],
    },
  );
}

export function crimeOutcomeCard(
  outcome: CrimeOutcome,
  jailExpiresAt: number | null,
  cooldownExpiresAt: number,
): CardReply {
  if (outcome.success) {
    return makeSuccessCard(`${outcome.tier.emoji} ${outcome.tier.label} — Clean Getaway`, [
      `Score — ${formatMoney(outcome.payout)}`,
      `Next crime — ${formatTimestamp(new Date(cooldownExpiresAt), "R")}`,
    ]);
  }
  return makeErrorCard(`${outcome.tier.emoji} ${outcome.tier.label} — Busted`, [
    "No payout. The job went sideways.",
    jailExpiresAt === null
      ? "You slipped away without a sentence."
      : `Released — ${formatTimestamp(new Date(jailExpiresAt), "R")}`,
  ]);
}

export function grindResultCard(
  definition: GrindDefinition,
  outcome: GrindOutcome,
  cooldownExpiresAt: number,
): CardReply {
  const lines = [
    outcome.flavor,
    `**Earned** — ${formatMoney(outcome.total)}`,
  ];
  if (outcome.bonus > 0n) {
    lines.push(`**Bonus** — ${formatMoney(outcome.bonus)}`);
  }
  lines.push(
    `**Next** — ${formatTimestamp(new Date(cooldownExpiresAt), "R")}`,
  );
  return makeSuccessCard(
    `${definition.emoji} ${definition.label}`,
    lines,
    { footer: "Paid from the economy ledger" },
  );
}

export function shopViewCard(
  items: readonly ShopItem[],
  sold: readonly number[],
  page: number,
  totalPages: number,
  totalItems: number,
): CardReply {
  const lines = items.map((item, index) => {
    const parts = [`**${item.name}** — ${formatMoney(BigInt(item.price))}`];
    if (item.description.length > 0) parts.push(item.description);
    if (item.roleId) parts.push("grants a role");
    if (item.consumable) parts.push("consumable");
    if (item.stock === null) {
      parts.push("unlimited stock");
    } else {
      const remaining = Math.max(0, item.stock - (sold[index] ?? 0));
      parts.push(`${remaining}/${item.stock} left`);
    }
    return parts.join(" · ");
  });
  return makeListCard("🛒 Shop", lines, {
    footer: formatPageFooter(page - 1, totalPages, totalItems),
  });
}

export interface InventoryDisplay {
  name: string;
  count: number;
  description: string;
}

export function inventoryCard(
  entries: readonly InventoryDisplay[],
  page: number,
  totalPages: number,
  totalItems: number,
): CardReply {
  const lines = entries.map((entry) => {
    const detail = entry.description.length > 0 ? ` · ${entry.description}` : "";
    return `**${entry.name}** ×${entry.count}${detail}`;
  });
  return makeListCard("🎒 Inventory", lines, {
    footer: formatPageFooter(page - 1, totalPages, totalItems),
  });
}