import { describe, it, expect } from "vitest";
import { GRIND_DEFS, playGrind, rollGrind } from "./grinds.js";
import type { GamesLedger, WalletView } from "./ledger.js";

function makeLedger(wallet = 1000): GamesLedger & { log: string[] } {
  const log: string[] = [];
  const view = (): WalletView => ({ wallet, bank: 0, total: wallet });
  return {
    log,
    findAccount: async () => view(),
    ensureAccount: async () => view(),
    applyMutation: async (input) => {
      wallet += input.walletDelta + input.bankDelta;
      log.push(`${input.kind}:${input.walletDelta + input.bankDelta}`);
      return view();
    },
  };
}

const currency = {
  name: "credits",
  emoji: "🪙",
  startingWallet: 100,
  startingBank: 0,
  maxBalance: 1000000,
};

describe("grinds", () => {
  it("each grind has flavors and a sane payout band", () => {
    for (const def of Object.values(GRIND_DEFS)) {
      expect(def.flavors.length).toBeGreaterThan(0);
      expect(def.min).toBeGreaterThan(0);
      expect(def.max).toBeGreaterThanOrEqual(def.min);
      expect(def.bonusChance).toBeGreaterThan(0);
    }
  });

  it("rolls within range and skips the bonus most of the time", () => {
    const def = GRIND_DEFS.work;
    const plain = rollGrind(def, () => 0.9999);
    expect(plain.amount).toBe(def.max);
    expect(plain.bonus).toBe(0);
    const low = rollGrind(def, () => 0);
    expect(low.amount).toBe(def.min);
    expect(low.bonus).toBe(def.bonusMin);
  });

  it("credits base plus bonus through the ledger", async () => {
    const ledger = makeLedger();
    const result = await playGrind(
      ledger,
      currency,
      "g1",
      "u1",
      "fish",
      () => 0,
    );
    const def = GRIND_DEFS.fish;
    expect(result.amount).toBe(def.min);
    expect(result.bonus).toBe(def.bonusMin);
    expect(result.credited).toBe(def.min + def.bonusMin);
    expect(ledger.log).toEqual([
      `games_grind_fish:${def.min + def.bonusMin}`,
    ]);
  });
});
