import type { Container } from "@lumi-devs/lumi/services";
import { makeInfoCard, type CardReply } from "@lumi-devs/lumi/ui";
import { formatAmount, type CurrencyView } from "./Config.js";
import { creditWinnings } from "./Ledger.js";
import {
  decideOutcome,
  handLabel,
  handValue,
  isBlackjack,
  isBust,
  playDealer,
  profitFor,
  type BlackjackOutcome,
  type BlackjackState,
} from "./Blackjack.js";
import { settledLossCard, settledWinCard } from "./Ui.js";

export interface BlackjackSettlement {
  outcome: BlackjackOutcome;
  credited: number;
  card: CardReply;
}

function outcomeTitle(outcome: BlackjackOutcome): string {
  if (outcome === "playerBlackjack") return "Blackjack!";
  if (outcome === "playerWin" || outcome === "dealerBust")
    return "You win!";
  if (outcome === "push") return "Push";
  return "Dealer wins";
}

export async function settleBlackjack(
  services: Container,
  currency: CurrencyView,
  guildId: string,
  userId: string,
  state: BlackjackState,
  payout: number,
): Promise<BlackjackSettlement> {
  let dealer = [...state.dealer];
  if (
    !isBlackjack(state.player) &&
    !isBlackjack(dealer) &&
    !isBust(state.player)
  )
    dealer = playDealer([...state.deck], dealer).hand;
  const outcome = decideOutcome(state.player, dealer);
  const lines = [
    `Bet: **${formatAmount(currency, state.bet)}**`,
    `**You (${handValue(state.player)}):** ${handLabel(state.player, false)}`,
    `**Dealer (${handValue(dealer)}):** ${handLabel(dealer, false)}`,
  ];
  if (outcome === "push") {
    const { credited } = await creditWinnings(services, guildId, userId, state.bet);
    return {
      outcome,
      credited,
      card: makeInfoCard(outcomeTitle(outcome), [
        ...lines,
        `Stake refunded: **${formatAmount(currency, credited)}**`,
      ].join("\n")),
    };
  }
  const profit = profitFor(outcome, state.bet, payout);
  if (profit <= 0) {
    return {
      outcome,
      credited: 0,
      card: settledLossCard(outcomeTitle(outcome), [
        ...lines,
        `Lost: **${formatAmount(currency, state.bet)}**`,
      ].join("\n")),
    };
  }
  const { credited } = await creditWinnings(services, guildId, userId, state.bet + profit);
  return {
    outcome,
    credited,
    card: settledWinCard(outcomeTitle(outcome), [
      ...lines,
      `Won: **${formatAmount(currency, credited)}**`,
    ].join("\n")),
  };
}
