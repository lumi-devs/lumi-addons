import { describe, it, expect } from "vitest";
import {
  buildDeck,
  cardLabel,
  decideOutcome,
  dealerShouldHit,
  handLabel,
  handValue,
  isBlackjack,
  isBust,
  playDealer,
  profitFor,
  shuffleDeck,
  type GameCard,
} from "./blackjack.js";

const card = (rank: string): GameCard => ({ rank, suit: "spades" });

describe("blackjack", () => {
  it("builds a 52-card deck with unique cards", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardLabel))).toHaveLength(52);
  });

  it("shuffles into a permutation of the same multiset", () => {
    const deck = buildDeck();
    const shuffled = shuffleDeck(deck, () => 0.5);
    expect(shuffled).toHaveLength(52);
    expect([...shuffled.map(cardLabel)].sort()).toEqual(
      [...deck.map(cardLabel)].sort(),
    );
  });

  it("values hands with aces soft and hard", () => {
    expect(handValue([card("A"), card("K")])).toBe(21);
    expect(handValue([card("A"), card("9"), card("A")])).toBe(21);
    expect(handValue([card("A"), card("A"), card("9")])).toBe(21);
    expect(handValue([card("K"), card("Q"), card("5")])).toBe(25);
    expect(handValue([card("2"), card("3")])).toBe(5);
  });

  it("detects naturals and busts", () => {
    expect(isBlackjack([card("A"), card("K")])).toBe(true);
    expect(isBlackjack([card("A"), card("K"), card("Q")])).toBe(false);
    expect(isBlackjack([card("K"), card("Q")])).toBe(false);
    expect(isBust([card("K"), card("Q"), card("2")])).toBe(true);
    expect(isBust([card("K"), card("Q")])).toBe(false);
  });

  it("dealer hits below 17 and stands on 17+", () => {
    expect(dealerShouldHit([card("10"), card("6")])).toBe(true);
    expect(dealerShouldHit([card("10"), card("7")])).toBe(false);
    expect(dealerShouldHit([card("A"), card("6")])).toBe(false);
  });

  it("plays the dealer out to at least 17", () => {
    const { hand, deck } = playDealer(
      [card("5")],
      [card("10"), card("6")],
    );
    expect(handValue(hand)).toBe(21);
    expect(deck).toHaveLength(0);
  });

  it("decides naturals before anything else", () => {
    const natural = [card("A"), card("K")];
    expect(decideOutcome(natural, [card("9"), card("7")])).toBe(
      "playerBlackjack",
    );
    expect(decideOutcome([card("9"), card("7")], natural)).toBe("dealerWin");
    expect(decideOutcome(natural, natural)).toBe("push");
  });

  it("decides busts, wins, and pushes", () => {
    expect(
      decideOutcome(
        [card("K"), card("Q"), card("5")],
        [card("10"), card("6")],
      ),
    ).toBe("playerBust");
    expect(
      decideOutcome(
        [card("10"), card("7")],
        [card("K"), card("Q"), card("5")],
      ),
    ).toBe("dealerBust");
    expect(decideOutcome([card("10"), card("9")], [card("10"), card("7")])).toBe(
      "playerWin",
    );
    expect(decideOutcome([card("10"), card("7")], [card("10"), card("9")])).toBe(
      "dealerWin",
    );
    expect(decideOutcome([card("10"), card("7")], [card("9"), card("8")])).toBe(
      "push",
    );
  });

  it("prices profits with the configured blackjack payout", () => {
    expect(profitFor("playerBlackjack", 100, 1.5)).toBe(150);
    expect(profitFor("playerBlackjack", 101, 1.5)).toBe(151);
    expect(profitFor("playerWin", 100, 1.5)).toBe(100);
    expect(profitFor("dealerBust", 100, 1.5)).toBe(100);
    expect(profitFor("push", 100, 1.5)).toBe(0);
    expect(profitFor("playerBust", 100, 1.5)).toBe(0);
    expect(profitFor("dealerWin", 100, 1.5)).toBe(0);
  });

  it("labels hands and hides the hole card", () => {
    const hand = [card("A"), card("K")];
    expect(handLabel(hand, false)).toContain("A♠");
    expect(handLabel(hand, true)).toBe("A♠ ??");
  });
});
