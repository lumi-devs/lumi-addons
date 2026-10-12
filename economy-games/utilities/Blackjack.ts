export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export interface GameCard {
  rank: string;
  suit: Suit;
}

export interface BlackjackState {
  userId: string;
  bet: number;
  deck: GameCard[];
  player: GameCard[];
  dealer: GameCard[];
}

export type BlackjackOutcome =
  | "playerBlackjack"
  | "playerWin"
  | "dealerWin"
  | "playerBust"
  | "dealerBust"
  | "push";

const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"];

const SUIT_GLYPH: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export function buildDeck(): GameCard[] {
  const deck: GameCard[] = [];
  for (const suit of SUITS)
    for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

export function shuffleDeck(
  deck: GameCard[],
  random: () => number = Math.random,
): GameCard[] {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const upper = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = upper;
  }
  return cards;
}

export function handValue(hand: GameCard[]): number {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      aces += 1;
      total += 11;
    } else if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function isBlackjack(hand: GameCard[]): boolean {
  return hand.length === 2 && handValue(hand) === 21;
}

export function isBust(hand: GameCard[]): boolean {
  return handValue(hand) > 21;
}

export function dealerShouldHit(hand: GameCard[]): boolean {
  return handValue(hand) < 17;
}

export function playDealer(
  deck: GameCard[],
  hand: GameCard[],
): { hand: GameCard[]; deck: GameCard[] } {
  const rest = [...deck];
  const current = [...hand];
  while (dealerShouldHit(current)) {
    const next = rest.pop();
    if (!next) break;
    current.push(next);
  }
  return { hand: current, deck: rest };
}

export function decideOutcome(
  player: GameCard[],
  dealer: GameCard[],
): BlackjackOutcome {
  const playerNatural = isBlackjack(player);
  const dealerNatural = isBlackjack(dealer);
  if (playerNatural || dealerNatural) {
    if (playerNatural && dealerNatural) return "push";
    return playerNatural ? "playerBlackjack" : "dealerWin";
  }
  if (isBust(player)) return "playerBust";
  if (isBust(dealer)) return "dealerBust";
  const playerValue = handValue(player);
  const dealerValue = handValue(dealer);
  if (playerValue > dealerValue) return "playerWin";
  if (playerValue < dealerValue) return "dealerWin";
  return "push";
}

export function profitFor(
  outcome: BlackjackOutcome,
  bet: number,
  payoutMultiplier: number,
): number {
  if (outcome === "playerBlackjack")
    return Math.floor(bet * payoutMultiplier);
  if (outcome === "playerWin" || outcome === "dealerBust") return bet;
  return 0;
}

export function cardLabel(card: GameCard): string {
  return `${card.rank}${SUIT_GLYPH[card.suit]}`;
}

export function handLabel(hand: GameCard[], hideHole: boolean): string {
  if (hideHole && hand.length > 1)
    return `${cardLabel(hand[0]!)} ??`;
  return hand.map(cardLabel).join(" ");
}
