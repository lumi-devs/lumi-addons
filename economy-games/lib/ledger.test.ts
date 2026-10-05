import { describe, it, expect, vi } from "vitest";
import {
  creditCapped,
  debitBet,
  LedgerInsufficientFunds,
  type GamesLedger,
  type MutationInput,
  type WalletView,
} from "./ledger.js";
import { profitFor } from "./blackjack.js";

vi.mock("@sapphire/framework", () => ({ container: {} }));

const currency = {
  name: "credits",
  emoji: "🪙",
  startingWallet: 100,
  startingBank: 0,
  maxBalance: 1000,
};

function makeLedger(startWallet = 500): GamesLedger & {
  mutations: MutationInput[];
} {
  let wallet = startWallet;
  let bank = 0;
  const mutations: MutationInput[] = [];
  const view = (): WalletView => ({ wallet, bank, total: wallet + bank });
  return {
    mutations,
    findAccount: async () => view(),
    ensureAccount: async () => view(),
    applyMutation: async (input) => {
      if (wallet + input.walletDelta < 0 || bank + input.bankDelta < 0) {
        throw Object.assign(new Error("Insufficient funds."), {
          code: "InsufficientFunds",
        });
      }
      wallet += input.walletDelta;
      bank += input.bankDelta;
      mutations.push(input);
      return view();
    },
  };
}

describe("ledger", () => {
  it("debits a bet with a ledger row", async () => {
    const ledger = makeLedger();
    const after = await debitBet(
      ledger,
      currency,
      "g1",
      "u1",
      100,
      "games_blackjack_bid",
      "blackjack bid 100",
    );
    expect(after.wallet).toBe(400);
    expect(ledger.mutations).toHaveLength(1);
    expect(ledger.mutations[0]).toMatchObject({
      kind: "games_blackjack_bid",
      walletDelta: -100,
    });
  });

  it("maps repository shortfalls to LedgerInsufficientFunds", async () => {
    const ledger = makeLedger(50);
    await expect(
      debitBet(
        ledger,
        currency,
        "g1",
        "u1",
        100,
        "games_roulette_bid",
        "roulette bid 100",
      ),
    ).rejects.toBeInstanceOf(LedgerInsufficientFunds);
    expect(ledger.mutations).toHaveLength(0);
  });

  it("credits winnings and caps at the server maximum", async () => {
    const ledger = makeLedger(900);
    const { balance, credited } = await creditCapped(
      ledger,
      currency,
      "g1",
      "u1",
      250,
      "games_blackjack_win",
      "blackjack win",
    );
    expect(credited).toBe(100);
    expect(balance.total).toBe(1000);
    expect(ledger.mutations[0]).toMatchObject({
      kind: "games_blackjack_win",
      walletDelta: 100,
    });
  });

  it("skips the write when the balance is already maxed", async () => {
    const ledger = makeLedger(1000);
    const { credited } = await creditCapped(
      ledger,
      currency,
      "g1",
      "u1",
      50,
      "games_grind_work",
      "work",
    );
    expect(credited).toBe(0);
    expect(ledger.mutations).toHaveLength(0);
  });

  it("settles a natural blackjack through bid then win rows", async () => {
    const ledger = makeLedger(500);
    await debitBet(
      ledger,
      currency,
      "g1",
      "u1",
      100,
      "games_blackjack_bid",
      "blackjack bid 100",
    );
    const profit = profitFor("playerBlackjack", 100, 1.5);
    const { credited } = await creditCapped(
      ledger,
      currency,
      "g1",
      "u1",
      100 + profit,
      "games_blackjack_win",
      "blackjack win bet 100 profit 150",
    );
    expect(profit).toBe(150);
    expect(credited).toBe(250);
    expect(ledger.mutations.map((m) => m.kind)).toEqual([
      "games_blackjack_bid",
      "games_blackjack_win",
    ]);
  });

  it("settles a shop purchase and a consumable reward", async () => {
    const ledger = makeLedger(500);
    await debitBet(
      ledger,
      currency,
      "g1",
      "u1",
      120,
      "games_shop_buy",
      "shop buy Lucky Box",
    );
    const { credited } = await creditCapped(
      ledger,
      currency,
      "g1",
      "u1",
      60,
      "games_shop_use",
      "shop use Lucky Box rewarded 60",
    );
    expect(credited).toBe(60);
    expect(ledger.mutations.map((m) => m.kind)).toEqual([
      "games_shop_buy",
      "games_shop_use",
    ]);
  });
});
