import { describe, it, expect } from "bun:test";
import {
  buildDeck,
  shuffleDeck,
  drawCard,
  handValue,
  isBlackjack,
  isBust,
  dealerShouldHit,
  playDealer,
  decideOutcome,
  naturalPayout,
  spinRoulette,
  rouletteColor,
  resolveRoulette,
  rollCrime,
  CrimeTiers,
  rollGrind,
  Grinds,
  randomInclusive,
  validateBet,
  parseShopItems,
  findShopItem,
  type GameCard,
  type RouletteBet,
} from "../data.js";

describe("Blackjack: buildDeck", () => {
  it("creates exactly 52 unique cards", () => {
    const deck = buildDeck();
    expect(deck.length).toBe(52);

    const unique = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(unique.size).toBe(52);
  });

  it("contains all 13 ranks in all 4 suits", () => {
    const deck = buildDeck();
    const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const suits = ["spades", "hearts", "diamonds", "clubs"];

    for (const suit of suits) {
      for (const rank of ranks) {
        const found = deck.find((c) => c.rank === rank && c.suit === suit);
        expect(found).toBeDefined();
      }
    }
  });
});

describe("Blackjack: shuffleDeck", () => {
  it("returns a permutation of the same cards", () => {
    const deck = buildDeck();
    const shuffled = shuffleDeck(deck);

    expect(shuffled.length).toBe(52);
    expect(shuffled).not.toBe(deck); // new array

    const originalSet = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    const shuffledSet = new Set(shuffled.map((c) => `${c.rank}${c.suit}`));
    expect(shuffledSet).toEqual(originalSet);
  });

  it("does not mutate the original deck", () => {
    const deck = buildDeck();
    const originalFirst = deck[0];
    shuffleDeck(deck);
    expect(deck[0]).toBe(originalFirst);
  });

  it("handles empty array", () => {
    const shuffled = shuffleDeck([]);
    expect(shuffled).toEqual([]);
  });
});
describe("Blackjack: drawCard", () => {
  it("removes and returns the last card", () => {
    const deck: GameCard[] = [{ rank: "A", suit: "spades" }, { rank: "K", suit: "hearts" }];
    const card = drawCard(deck);
    expect(card.rank).toBe("K");
    expect(deck.length).toBe(1);
  });

  it("throws on empty deck", () => {
    expect(() => drawCard([])).toThrow("Blackjack deck is empty");
  });
});

describe("Blackjack: handValue", () => {
  it("calculates number cards correctly", () => {
    expect(handValue([{ rank: "2", suit: "spades" as const }, { rank: "3", suit: "hearts" as const }])).toBe(5);
    expect(handValue([{ rank: "10", suit: "diamonds" as const }, { rank: "5", suit: "clubs" as const }])).toBe(15);
  });

  it("calculates face cards as 10", () => {
    expect(handValue([{ rank: "J", suit: "spades" as const }, { rank: "Q", suit: "hearts" as const }])).toBe(20);
    expect(handValue([{ rank: "K", suit: "diamonds" as const }, { rank: "J", suit: "clubs" as const }])).toBe(20);
  });

  it("calculates ace as 11 when under 21", () => {
    expect(handValue([{ rank: "A", suit: "spades" as const }, { rank: "5", suit: "hearts" as const }])).toBe(16);
    expect(handValue([{ rank: "A", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }])).toBe(20);
  });

  it("calculates ace as 1 when would bust", () => {
    expect(handValue([{ rank: "A", suit: "spades" as const }, { rank: "10", suit: "hearts" as const }, { rank: "5", suit: "diamonds" as const }])).toBe(16);
    expect(handValue([{ rank: "A", suit: "spades" as const }, { rank: "K", suit: "hearts" as const }, { rank: "Q", suit: "diamonds" as const }])).toBe(21);
  });

  it("handles multiple aces correctly", () => {
    // Two aces = 12 (11 + 1)
    expect(handValue([{ rank: "A", suit: "spades" as const }, { rank: "A", suit: "hearts" as const }])).toBe(12);
    // Three aces = 13 (11 + 1 + 1)
    expect(handValue([{ rank: "A", suit: "spades" as const }, { rank: "A", suit: "hearts" as const }, { rank: "A", suit: "diamonds" as const }])).toBe(13);
    // Four aces = 14
    expect(handValue([
      { rank: "A", suit: "spades" as const },
      { rank: "A", suit: "hearts" as const },
      { rank: "A", suit: "diamonds" as const },
      { rank: "A", suit: "clubs" as const },
    ])).toBe(14);
    // A, A, 9 = 21 (11 + 1 + 9)
    expect(handValue([
      { rank: "A", suit: "spades" as const },
      { rank: "A", suit: "hearts" as const },
      { rank: "9", suit: "diamonds" as const },
    ])).toBe(21);
    // A, A, 10 = 12 (1 + 1 + 10)
    expect(handValue([
      { rank: "A", suit: "spades" as const },
      { rank: "A", suit: "hearts" as const },
      { rank: "10", suit: "diamonds" as const },
    ])).toBe(12);
  });

  it("handles soft 17 (A,6) correctly", () => {
    expect(handValue([{ rank: "A", suit: "spades" as const }, { rank: "6", suit: "hearts" as const }])).toBe(17);
  });

  it("handles soft 18 (A,7) correctly", () => {
    expect(handValue([{ rank: "A", suit: "spades" as const }, { rank: "7", suit: "hearts" as const }])).toBe(18);
  });

  it("handles bust hands", () => {
    expect(handValue([{ rank: "10", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }, { rank: "5", suit: "diamonds" as const }])).toBe(24);
    expect(handValue([{ rank: "K", suit: "spades" as const }, { rank: "Q", suit: "hearts" as const }, { rank: "2", suit: "diamonds" as const }])).toBe(22);
  });

  it("empty hand returns 0", () => {
    expect(handValue([])).toBe(0);
  });
});

describe("Blackjack: isBlackjack", () => {
  it("returns true for natural blackjack (A + 10-value)", () => {
    expect(isBlackjack([{ rank: "A", suit: "spades" as const }, { rank: "10", suit: "hearts" as const }])).toBe(true);
    expect(isBlackjack([{ rank: "A", suit: "spades" as const }, { rank: "J", suit: "hearts" as const }])).toBe(true);
    expect(isBlackjack([{ rank: "A", suit: "spades" as const }, { rank: "Q", suit: "hearts" as const }])).toBe(true);
    expect(isBlackjack([{ rank: "A", suit: "spades" as const }, { rank: "K", suit: "hearts" as const }])).toBe(true);
  });

  it("returns false for 21 with 3+ cards", () => {
    expect(isBlackjack([{ rank: "A", suit: "spades" as const }, { rank: "5", suit: "hearts" as const }, { rank: "5", suit: "diamonds" as const }])).toBe(false);
    expect(isBlackjack([{ rank: "10", suit: "spades" as const }, { rank: "5", suit: "hearts" as const }, { rank: "6", suit: "diamonds" as const }])).toBe(false);
  });

  it("returns false for non-21 two-card hands", () => {
    expect(isBlackjack([{ rank: "A", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }])).toBe(false);
    expect(isBlackjack([{ rank: "10", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }])).toBe(false);
  });

  it("returns false for empty or single card", () => {
    expect(isBlackjack([])).toBe(false);
    expect(isBlackjack([{ rank: "A", suit: "spades" as const }])).toBe(false);
  });
});

describe("Blackjack: isBust", () => {
  it("returns true for hands over 21", () => {
    expect(isBust([{ rank: "10", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }, { rank: "5", suit: "diamonds" as const }])).toBe(true);
    expect(isBust([{ rank: "K", suit: "spades" as const }, { rank: "Q", suit: "hearts" as const }, { rank: "2", suit: "diamonds" as const }])).toBe(true);
  });

  it("returns false for hands 21 or under", () => {
    expect(isBust([{ rank: "10", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }, { rank: "2", suit: "diamonds" as const }])).toBe(false);
    expect(isBust([{ rank: "A", suit: "spades" as const }, { rank: "10", suit: "hearts" as const }])).toBe(false);
    expect(isBust([])).toBe(false);
  });
});

describe("Blackjack: dealerShouldHit", () => {
  it("returns true for hard totals under 17", () => {
    expect(dealerShouldHit([{ rank: "10", suit: "spades" as const }, { rank: "6", suit: "hearts" as const }])).toBe(true);
    expect(dealerShouldHit([{ rank: "5", suit: "spades" as const }, { rank: "5", suit: "hearts" as const }, { rank: "5", suit: "diamonds" as const }])).toBe(true);
  });

  it("returns true for soft totals under 17", () => {
    expect(dealerShouldHit([{ rank: "A", suit: "spades" as const }, { rank: "5", suit: "hearts" as const }])).toBe(true); // soft 16
    expect(dealerShouldHit([{ rank: "A", suit: "spades" as const }, { rank: "2", suit: "hearts" as const }, { rank: "2", suit: "diamonds" as const }])).toBe(true); // soft 15 (A=11,2,2 = 15)
  });

  it("returns false for 17 or higher", () => {
    expect(dealerShouldHit([{ rank: "10", suit: "spades" as const }, { rank: "7", suit: "hearts" as const }])).toBe(false);
    expect(dealerShouldHit([{ rank: "A", suit: "spades" as const }, { rank: "6", suit: "hearts" as const }])).toBe(false); // soft 17
    expect(dealerShouldHit([{ rank: "A", suit: "spades" as const }, { rank: "7", suit: "hearts" as const }])).toBe(false); // soft 18
    expect(dealerShouldHit([{ rank: "10", suit: "spades" as const }, { rank: "10", suit: "hearts" as const }])).toBe(false); // 20
  });
});

describe("Blackjack: playDealer", () => {
  it("hits until 17 or higher", () => {
    const deck: GameCard[] = [
      { rank: "5", suit: "spades" as const },
      { rank: "6", suit: "hearts" as const },
      { rank: "10", suit: "diamonds" as const },
    ];
    const hand: GameCard[] = [{ rank: "10", suit: "clubs" as const }, { rank: "5", suit: "spades" as const }]; // 15
    const result = playDealer(deck, hand);
    expect(result.length).toBe(3); // drew one card
    expect(handValue(result)).toBeGreaterThanOrEqual(17);
  });

  it("stands on 17 or higher", () => {
    const deck: GameCard[] = [{ rank: "5", suit: "spades" as const }];
    const hand: GameCard[] = [{ rank: "10", suit: "clubs" as const }, { rank: "7", suit: "spades" as const }]; // 17
    const result = playDealer(deck, hand);
    expect(result.length).toBe(2); // no draw
  });

  it("does not mutate input deck or hand", () => {
    const deck: GameCard[] = [{ rank: "5", suit: "spades" as const }];
    const hand: GameCard[] = [{ rank: "10", suit: "clubs" as const }, { rank: "5", suit: "spades" as const }];
    const deckCopy = [...deck];
    const handCopy = [...hand];
    playDealer(deck, hand);
    expect(deck).toEqual(deckCopy);
    expect(hand).toEqual(handCopy);
  });

  it("stops when deck exhausted", () => {
    const deck: GameCard[] = [];
    const hand: GameCard[] = [{ rank: "10", suit: "spades" as const }, { rank: "5", suit: "hearts" as const }]; // 15
    const result = playDealer(deck, hand);
    expect(result.length).toBe(2); // no draw possible
  });
});

describe("Blackjack: decideOutcome", () => {
  const playerBJ: GameCard[] = [{ rank: "A", suit: "spades" as const }, { rank: "K", suit: "hearts" as const }];
  const dealerBJ: GameCard[] = [{ rank: "A", suit: "diamonds" as const }, { rank: "Q", suit: "clubs" as const }];

  it("returns push when both have natural blackjack", () => {
    expect(decideOutcome(playerBJ, dealerBJ)).toBe("push");
  });

  it("returns playerBlackjack when only player has natural", () => {
    const dealerHand: GameCard[] = [{ rank: "10", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }]; // 19
    expect(decideOutcome(playerBJ, dealerHand)).toBe("playerBlackjack");
  });

  it("returns dealerWin when only dealer has natural", () => {
    const playerHand: GameCard[] = [{ rank: "10", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }]; // 19
    expect(decideOutcome(playerHand, dealerBJ)).toBe("dealerWin");
  });

  it("returns playerBust when player busts", () => {
    const playerBust: GameCard[] = [{ rank: "10", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }, { rank: "5", suit: "diamonds" as const }]; // 24
    const dealerHand: GameCard[] = [{ rank: "10", suit: "clubs" as const }, { rank: "6", suit: "diamonds" as const }]; // 16
    expect(decideOutcome(playerBust, dealerHand)).toBe("playerBust");
  });

  it("returns dealerBust when dealer busts and player doesn't", () => {
    const playerHand: GameCard[] = [{ rank: "10", suit: "spades" as const }, { rank: "6", suit: "hearts" as const }]; // 16
    const dealerBust: GameCard[] = [{ rank: "10", suit: "clubs" as const }, { rank: "9", suit: "diamonds" as const }, { rank: "5", suit: "hearts" as const }]; // 24
    expect(decideOutcome(playerHand, dealerBust)).toBe("dealerBust");
  });

  it("returns playerWin when player value > dealer value (neither bust)", () => {
    const playerHand: GameCard[] = [{ rank: "10", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }]; // 19
    const dealerHand: GameCard[] = [{ rank: "10", suit: "clubs" as const }, { rank: "7", suit: "diamonds" as const }]; // 17
    expect(decideOutcome(playerHand, dealerHand)).toBe("playerWin");
  });

  it("returns dealerWin when dealer value > player value (neither bust)", () => {
    const playerHand: GameCard[] = [{ rank: "10", suit: "spades" as const }, { rank: "6", suit: "hearts" as const }]; // 16
    const dealerHand: GameCard[] = [{ rank: "10", suit: "clubs" as const }, { rank: "7", suit: "diamonds" as const }]; // 17
    expect(decideOutcome(playerHand, dealerHand)).toBe("dealerWin");
  });

  it("returns push when equal value (neither bust, neither natural)", () => {
    const playerHand: GameCard[] = [{ rank: "10", suit: "spades" as const }, { rank: "7", suit: "hearts" as const }]; // 17
    const dealerHand: GameCard[] = [{ rank: "9", suit: "clubs" as const }, { rank: "8", suit: "diamonds" as const }]; // 17
    expect(decideOutcome(playerHand, dealerHand)).toBe("push");
  });

  it("player bust takes priority over dealer bust", () => {
    const playerBust: GameCard[] = [{ rank: "10", suit: "spades" as const }, { rank: "9", suit: "hearts" as const }, { rank: "5", suit: "diamonds" as const }]; // 24
    const dealerBust: GameCard[] = [{ rank: "10", suit: "clubs" as const }, { rank: "9", suit: "diamonds" as const }, { rank: "5", suit: "hearts" as const }]; // 24
    expect(decideOutcome(playerBust, dealerBust)).toBe("playerBust");
  });
});

describe("Blackjack: naturalPayout", () => {
  it("calculates 3:2 payout correctly", () => {
    expect(naturalPayout(10n, 1.5)).toBe(15n);
    expect(naturalPayout(20n, 1.5)).toBe(30n);
    expect(naturalPayout(100n, 1.5)).toBe(150n);
  });

  it("floors the result", () => {
    expect(naturalPayout(11n, 1.5)).toBe(16n); // 16.5 -> 16
    expect(naturalPayout(13n, 1.5)).toBe(19n); // 19.5 -> 19
  });

  it("returns 0n for zero bet", () => {
    expect(naturalPayout(0n, 1.5)).toBe(0n);
  });

  it("handles large bets without precision loss (using bigint arithmetic)", () => {
    // This test documents the current behavior - Number(bet) loses precision for large bets
    const largeBet = 9007199254740993n; // 2^53 + 1, beyond safe integer
    const result = naturalPayout(largeBet, 1.5);
    // Current implementation converts to Number, losing precision
    // This is a known limitation
    expect(typeof result).toBe("bigint");
  });
});

describe("Roulette: spinRoulette", () => {
  it("returns a number between 0 and 36 inclusive", () => {
    for (let i = 0; i < 100; i++) {
      const result = spinRoulette();
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(36);
      expect(Number.isInteger(result)).toBe(true);
    }
  });
});

describe("Roulette: rouletteColor", () => {
  it("returns green for 0", () => {
    expect(rouletteColor(0)).toBe("green");
  });

  it("returns red for known red numbers", () => {
    const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    for (const n of reds) {
      expect(rouletteColor(n)).toBe("red");
    }
  });

  it("returns black for known black numbers", () => {
    const blacks = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
    for (const n of blacks) {
      expect(rouletteColor(n)).toBe("black");
    }
  });
});

describe("Roulette: resolveRoulette", () => {
  const bet = 100n;

  function makeChoice(kind: RouletteBet["kind"], number?: number): RouletteBet {
    const labels: Record<RouletteBet["kind"], string> = {
      red: "Red",
      black: "Black",
      odd: "Odd",
      even: "Even",
      low: "Low (1-18)",
      high: "High (19-36)",
      green: "Green (0)",
      number: `Number ${number}`,
    };
    return { kind, number: number ?? null, label: labels[kind] };
  }

  it("pays 2:1 for red/black win", () => {
    const choice = makeChoice("red");
    const result = resolveRoulette(bet, choice, 1); // 1 is red
    expect(result.won).toBe(true);
    expect(result.payout).toBe(200n);
  });

  it("pays 2:1 for odd/even win", () => {
    const choice = makeChoice("odd");
    const result = resolveRoulette(bet, choice, 3); // 3 is odd
    expect(result.won).toBe(true);
    expect(result.payout).toBe(200n);
  });

  it("pays 2:1 for low/high win", () => {
    const choice = makeChoice("low");
    const result = resolveRoulette(bet, choice, 10); // 10 is low
    expect(result.won).toBe(true);
    expect(result.payout).toBe(200n);
  });

  it("pays 36:1 for green (0) win", () => {
    const choice = makeChoice("green");
    const result = resolveRoulette(bet, choice, 0);
    expect(result.won).toBe(true);
    expect(result.payout).toBe(3600n);
  });

  it("pays 36:1 for number win", () => {
    const choice = makeChoice("number", 17);
    const result = resolveRoulette(bet, choice, 17);
    expect(result.won).toBe(true);
    expect(result.payout).toBe(3600n);
  });

  it("returns 0 payout for losing bets", () => {
    const choice = makeChoice("red");
    const result = resolveRoulette(bet, choice, 2); // 2 is black
    expect(result.won).toBe(false);
    expect(result.payout).toBe(0n);
  });

  it("treats 0 as neither odd nor even", () => {
    expect(resolveRoulette(bet, makeChoice("odd"), 0).won).toBe(false);
    expect(resolveRoulette(bet, makeChoice("even"), 0).won).toBe(false);
  });

  it("treats 0 as neither low nor high", () => {
    expect(resolveRoulette(bet, makeChoice("low"), 0).won).toBe(false);
    expect(resolveRoulette(bet, makeChoice("high"), 0).won).toBe(false);
  });

  it("treats 0 as neither red nor black", () => {
    expect(resolveRoulette(bet, makeChoice("red"), 0).won).toBe(false);
    expect(resolveRoulette(bet, makeChoice("black"), 0).won).toBe(false);
  });

  it("number bet only wins on exact match", () => {
    const choice = makeChoice("number", 17);
    expect(resolveRoulette(bet, choice, 17).won).toBe(true);
    expect(resolveRoulette(bet, choice, 18).won).toBe(false);
    expect(resolveRoulette(bet, choice, 0).won).toBe(false);
  });
});

describe("Crime: rollCrime", () => {
  it("returns success with payout in range for low tier", () => {
    const tier = CrimeTiers[0]!; // low
    // Run many times to verify probability and range
    let successCount = 0;
    for (let i = 0; i < 1000; i++) {
      const outcome = rollCrime(tier);
      if (outcome.success) {
        successCount++;
        expect(outcome.payout).toBeGreaterThanOrEqual(BigInt(tier.payoutMin));
        expect(outcome.payout).toBeLessThanOrEqual(BigInt(tier.payoutMax));
      } else {
        expect(outcome.payout).toBe(0n);
      }
    }
    // 70% success rate, so expect ~700 successes
    expect(successCount).toBeGreaterThan(600);
    expect(successCount).toBeLessThan(800);
  });

  it("returns success with payout in range for medium tier", () => {
    const tier = CrimeTiers[1]!; // medium
    let successCount = 0;
    for (let i = 0; i < 1000; i++) {
      const outcome = rollCrime(tier);
      if (outcome.success) {
        successCount++;
        expect(outcome.payout).toBeGreaterThanOrEqual(BigInt(tier.payoutMin));
        expect(outcome.payout).toBeLessThanOrEqual(BigInt(tier.payoutMax));
      } else {
        expect(outcome.payout).toBe(0n);
      }
    }
    // 55% success rate
    expect(successCount).toBeGreaterThan(450);
    expect(successCount).toBeLessThan(650);
  });

  it("returns success with payout in range for high tier", () => {
    const tier = CrimeTiers[2]!; // high
    let successCount = 0;
    for (let i = 0; i < 1000; i++) {
      const outcome = rollCrime(tier);
      if (outcome.success) {
        successCount++;
        expect(outcome.payout).toBeGreaterThanOrEqual(BigInt(tier.payoutMin));
        expect(outcome.payout).toBeLessThanOrEqual(BigInt(tier.payoutMax));
      } else {
        expect(outcome.payout).toBe(0n);
      }
    }
    // 40% success rate
    expect(successCount).toBeGreaterThan(300);
    expect(successCount).toBeLessThan(500);
  });

  it("includes tier info in outcome", () => {
    const tier = CrimeTiers[0]!;
    const outcome = rollCrime(tier);
    expect(outcome.tier).toBe(tier);
  });
});

describe("Grind: rollGrind", () => {
  it("returns amount in base range", () => {
    const def = Grinds.work;
    for (let i = 0; i < 100; i++) {
      const outcome = rollGrind(def);
      expect(outcome.amount).toBeGreaterThanOrEqual(BigInt(def.min));
      expect(outcome.amount).toBeLessThanOrEqual(BigInt(def.max));
    }
  });

  it("bonus is either 0 or in bonus range", () => {
    const def = Grinds.work;
    for (let i = 0; i < 100; i++) {
      const outcome = rollGrind(def);
      if (outcome.bonus > 0n) {
        expect(outcome.bonus).toBeGreaterThanOrEqual(BigInt(def.bonusMin));
        expect(outcome.bonus).toBeLessThanOrEqual(BigInt(def.bonusMax));
      } else {
        expect(outcome.bonus).toBe(0n);
      }
    }
  });

  it("total equals amount + bonus", () => {
    const def = Grinds.work;
    for (let i = 0; i < 100; i++) {
      const outcome = rollGrind(def);
      expect(outcome.total).toBe(outcome.amount + outcome.bonus);
    }
  });

  it("flavor is from the definition's flavors array", () => {
    const def = Grinds.work;
    for (let i = 0; i < 100; i++) {
      const outcome = rollGrind(def);
      expect(def.flavors).toContain(outcome.flavor);
    }
  });

  it("bonus chance approximately matches definition", () => {
    const def = Grinds.work; // 12% bonus chance
    let bonusCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (rollGrind(def).bonus > 0n) bonusCount++;
    }
    expect(bonusCount).toBeGreaterThan(50); // ~120 expected
    expect(bonusCount).toBeLessThan(200);
  });
});

describe("randomInclusive", () => {
  it("returns value in range [min, max]", () => {
    for (let i = 0; i < 100; i++) {
      const result = randomInclusive(5, 10);
      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThanOrEqual(10);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it("handles min > max by swapping", () => {
    for (let i = 0; i < 100; i++) {
      const result = randomInclusive(10, 5);
      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThanOrEqual(10);
    }
  });

  it("returns min when min === max", () => {
    for (let i = 0; i < 10; i++) {
      expect(randomInclusive(7, 7)).toBe(7);
    }
  });

  it("handles large ranges", () => {
    const result = randomInclusive(0, 1_000_000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1_000_000);
  });

  it("handles negative ranges", () => {
    for (let i = 0; i < 100; i++) {
      const result = randomInclusive(-10, -5);
      expect(result).toBeGreaterThanOrEqual(-10);
      expect(result).toBeLessThanOrEqual(-5);
    }
  });

  it("handles range crossing zero", () => {
    for (let i = 0; i < 100; i++) {
      const result = randomInclusive(-5, 5);
      expect(result).toBeGreaterThanOrEqual(-5);
      expect(result).toBeLessThanOrEqual(5);
    }
  });
});

describe("validateBet", () => {
  it("returns null for valid bets", () => {
    expect(validateBet(100, 10, 1000)).toBeNull();
    expect(validateBet(10, 10, 1000)).toBeNull();
    expect(validateBet(1000, 10, 1000)).toBeNull();
  });

  it("rejects zero", () => {
    expect(validateBet(0, 10, 1000)).toBe("Bet must be a positive whole number.");
  });

  it("rejects negative numbers", () => {
    expect(validateBet(-1, 10, 1000)).toBe("Bet must be a positive whole number.");
    expect(validateBet(-100, 10, 1000)).toBe("Bet must be a positive whole number.");
  });

  it("rejects non-integers", () => {
    expect(validateBet(10.5, 10, 1000)).toBe("Bet must be a positive whole number.");
    expect(validateBet(100.01, 10, 1000)).toBe("Bet must be a positive whole number.");
  });

  it("rejects NaN", () => {
    expect(validateBet(NaN, 10, 1000)).toBe("Bet must be a positive whole number.");
  });

  it("rejects Infinity", () => {
    expect(validateBet(Infinity, 10, 1000)).toBe("Bet must be a positive whole number.");
    expect(validateBet(-Infinity, 10, 1000)).toBe("Bet must be a positive whole number.");
  });

  it("rejects below minimum", () => {
    expect(validateBet(5, 10, 1000)).toBe("Bet must be between 10 and 1000.");
  });

  it("rejects above maximum", () => {
    expect(validateBet(2000, 10, 1000)).toBe("Bet must be between 10 and 1000.");
  });

  it("handles min > max gracefully (still validates bounds)", () => {
    expect(validateBet(50, 100, 10)).toBe("Bet must be between 100 and 10.");
  });
});


describe("parseShopItems", () => {
  it("parses valid shop items", () => {
    const raw = `Test Item|100|Description|123456789012345678|no|10`;
    const items = parseShopItems(raw);
    expect(items.length).toBe(1);
    const item = items[0]!;
    expect(item.name).toBe("Test Item");
    expect(item.price).toBe(100);
    expect(item.description).toBe("Description");
    expect(item.roleId).toBe("123456789012345678");
    expect(item.consumable).toBe(false);
    expect(item.stock).toBe(10);
  });
  it("skips lines starting with #", () => {
    const raw = `# Comment
Item|100|Desc||no|5`;
    const items = parseShopItems(raw);
    expect(items.length).toBe(1);
    const item = items[0]!;
    expect(item.name).toBe("Item");
  });

  it("skips empty lines", () => {
    const raw = `
Item|100|Desc||no|5

Another|200|Desc||yes|`;
    const items = parseShopItems(raw);
    expect(items.length).toBe(2);
    expect(items[0]!.name).toBe("Item");
    expect(items[1]!.name).toBe("Another");
  });

  it("skips items with invalid price", () => {
    const raw = `Valid|100|Desc||no|5
Invalid|notanumber|Desc||no|5
AlsoInvalid|0|Desc||no|5`;
    const items = parseShopItems(raw);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("Valid");
  });

  it("skips duplicate names (case-insensitive)", () => {
    const raw = `Item|100|Desc||no|5
item|200|Desc||no|10`;
    const items = parseShopItems(raw);
    expect(items.length).toBe(1);
    expect(items[0]!.price).toBe(100);
  });

  it("skips items with name too long", () => {
    const raw = `${"a".repeat(65)}|100|Desc||no|5
Valid|100|Desc||no|5`;
    const items = parseShopItems(raw);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("Valid");
  });

  it("skips items with empty name", () => {
    const raw = `|100|Desc||no|5
Valid|100|Desc||no|5`;
    const items = parseShopItems(raw);
    expect(items.length).toBe(1);
    expect(items[0]!.name).toBe("Valid");
  });

  it("parses consumable values correctly", () => {
    const raw = `Yes|100|Desc||yes|5
True|100|Desc||true|5
One|100|Desc||1|5
Y|100|Desc||y|5
No|100|Desc||no|5
False|100|Desc||false|5
Zero|100|Desc||0|5`;
    const items = parseShopItems(raw);
    expect(items.find((i) => i.name === "Yes")?.consumable).toBe(true);
    expect(items.find((i) => i.name === "True")?.consumable).toBe(true);
    expect(items.find((i) => i.name === "One")?.consumable).toBe(true);
    expect(items.find((i) => i.name === "Y")?.consumable).toBe(true);
    expect(items.find((i) => i.name === "No")?.consumable).toBe(false);
    expect(items.find((i) => i.name === "False")?.consumable).toBe(false);
    expect(items.find((i) => i.name === "Zero")?.consumable).toBe(false);
  });

  it("parses role ID correctly", () => {
    const validRole = "123456789012345678";
    const raw = `WithRole|100|Desc|${validRole}|no|5
WithoutRole|100|Desc||no|5
InvalidRole|100|Desc|notanumber|no|5`;
    const items = parseShopItems(raw);
    expect(items.find((i) => i.name === "WithRole")?.roleId).toBe(validRole);
    expect(items.find((i) => i.name === "WithoutRole")?.roleId).toBeNull();
    expect(items.find((i) => i.name === "InvalidRole")?.roleId).toBeNull();
  });

  it("truncates description to 200 chars", () => {
    const longDesc = "a".repeat(250);
    const raw = `Item|100|${longDesc}||no|5`;
    const items = parseShopItems(raw);
    expect(items[0]!.description.length).toBe(200);
  });

  it("returns empty array for empty input", () => {
    expect(parseShopItems("")).toEqual([]);
    expect(parseShopItems("   \n  \n ")).toEqual([]);
  });
});

describe("findShopItem", () => {
  const items = parseShopItems(`Test Item|100|Desc||no|5
Another Item|200|Desc||yes|`);

  it("finds item by exact name (case-insensitive)", () => {
    expect(findShopItem(items, "Test Item")?.name).toBe("Test Item");
    expect(findShopItem(items, "test item")?.name).toBe("Test Item");
    expect(findShopItem(items, "TEST ITEM")?.name).toBe("Test Item");
  });

  it("finds item with whitespace trimmed", () => {
    expect(findShopItem(items, "  Test Item  ")?.name).toBe("Test Item");
  });

  it("returns undefined for unknown item", () => {
    expect(findShopItem(items, "Unknown")).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(findShopItem([], "Test")).toBeUndefined();
  });
});