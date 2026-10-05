import { describe, it, expect } from "vitest";
import {
  CRIME_TIERS,
  findCrimeTier,
  isJailed,
  resolveCrime,
} from "./crime.js";

describe("crime", () => {
  it("tiers run from low-risk pickpocket to high-risk cybercrime", () => {
    expect(CRIME_TIERS.map((tier) => tier.id)).toEqual([
      "pickpocket",
      "shoplift",
      "burglary",
      "heist",
      "cybercrime",
    ]);
    const rates = CRIME_TIERS.map((tier) => tier.successRate);
    expect([...rates].sort((a, b) => b - a)).toEqual(rates);
    expect(findCrimeTier("heist")?.label).toBe("Bank Heist");
    expect(findCrimeTier("nope")).toBeUndefined();
  });

  it("success pays within the tier range with no jail", () => {
    const tier = findCrimeTier("burglary")!;
    const outcome = resolveCrime(tier, () => 0);
    expect(outcome.success).toBe(true);
    expect(outcome.amount).toBe(tier.payoutMin);
    expect(outcome.jailMinutes).toBe(0);
  });

  it("failure fines within range and jails within range", () => {
    const tier = findCrimeTier("burglary")!;
    const outcome = resolveCrime(tier, () => 0.9999);
    expect(outcome.success).toBe(false);
    expect(outcome.amount).toBe(tier.fineMax);
    expect(outcome.jailMinutes).toBe(tier.jailMaxMinutes);
  });

  it("detects active and expired jail records", () => {
    const now = Date.now();
    expect(isJailed(null, now)).toBe(false);
    expect(
      isJailed({ until: now + 60_000, reason: "failed heist" }, now),
    ).toBe(true);
    expect(
      isJailed({ until: now - 1000, reason: "failed heist" }, now),
    ).toBe(false);
  });
});
