import { makeInfoCard, type CardReply } from "lumi/ui";
import { formatAmount, type CurrencyConfig } from "./config.js";
import { creditCapped, type GamesLedger } from "./ledger.js";
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
} from "./blackjack.js";
import { settledLossCard, settledWinCard } from "./ui.js";

export interface BlackjackSettlement {
  outcome: BlackjackOutcome;
  credited: number;
  card: CardReply;
}

function outcomeTitle(outcome: BlackjackOutcome): string {
  if (outcome === "playerBlackjack") return "🂡 Blackjack!";
  if (outcome === "playerWin" || outcome === "dealerBust")
    return "🂡 You win!";
  if (outcome === "push") return "🂡 Push";
  return "🂡 Dealer wins";
}

export async function settleBlackjack(
  ledger: GamesLedger,
  currency: CurrencyConfig,
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
    const { credited } = await creditCapped(
      ledger,
      currency,
      guildId,
      userId,
      state.bet,
      "games_blackjack_push",
      `blackjack push refund ${state.bet}`,
    );
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
  const expected = state.bet + profit;
  const { credited } = await creditCapped(
    ledger,
    currency,
    guildId,
    userId,
    expected,
    "games_blackjack_win",
    `blackjack win bet ${state.bet} profit ${profit}`,
  );
  const cappedNote =
    credited < expected ? " *(capped at the server maximum)*" : "";
  return {
    outcome,
    credited,
    card: settledWinCard(outcomeTitle(outcome), [
      ...lines,
      `Won: **${formatAmount(currency, credited)}**${cappedNote}`,
    ].join("\n")),
  };
}
