import { describe, it, expect } from "vitest";
import {
  loungeName,
  parseLoungeNumber,
  nextFreeNumber,
  evaluateLounges,
  type LoungeSlot,
  type LoungeRules,
} from "./engine.js";

const RULES: LoungeRules = {
  busyThreshold: 2,
  maxExtras: 3,
  nameTemplate: "Lounge {n}",
};

const base = (count: number): LoungeSlot => ({
  channelId: "base",
  number: 0,
  count,
  isBase: true,
});
const extra = (id: string, number: number, count: number): LoungeSlot => ({
  channelId: id,
  number,
  count,
  isBase: false,
});

describe("engine names + numbers", () => {
  it("renders and parses the template", () => {
    expect(loungeName("Lounge {n}", 3)).toBe("Lounge 3");
    expect(parseLoungeNumber("Lounge {n}", "Lounge 3")).toBe(3);
    expect(parseLoungeNumber("Lounge {n}", "Lounge")).toBeNull();
    expect(parseLoungeNumber("🔊 lounge {n} ꜝ", "🔊 lounge 12 ꜝ")).toBe(12);
  });

  it("allocates the lowest free number", () => {
    expect(nextFreeNumber([])).toBe(1);
    expect(nextFreeNumber([1, 2])).toBe(3);
    expect(nextFreeNumber([1, 3])).toBe(2); // fills the gap
    expect(nextFreeNumber([2, 3])).toBe(1);
  });
});

describe("evaluateLounges", () => {
  it("creates when every lounge is busy and there is headroom", () => {
    const action = evaluateLounges([base(2), extra("a", 1, 2)], RULES, false);
    expect(action).toEqual({ kind: "create", number: 2 });
  });

  it("does not create while on cooldown", () => {
    expect(evaluateLounges([base(3)], RULES, true)).toEqual({ kind: "none" });
  });

  it("does not create past the max-extras cap", () => {
    const slots = [
      base(2),
      extra("a", 1, 2),
      extra("b", 2, 2),
      extra("c", 3, 2),
    ];
    expect(evaluateLounges(slots, RULES, false)).toEqual({ kind: "none" });
  });

  it("deletes the highest-numbered empty extra first", () => {
    const slots = [base(2), extra("a", 1, 0), extra("b", 2, 0)];
    expect(evaluateLounges(slots, RULES, false)).toEqual({
      kind: "delete",
      channelId: "b",
    });
  });

  it("prefers reclaiming an empty extra over creating", () => {
    // base busy, one extra full, one extra empty → reclaim, don't grow
    const slots = [base(5), extra("a", 1, 5), extra("b", 2, 0)];
    expect(evaluateLounges(slots, RULES, false)).toEqual({
      kind: "delete",
      channelId: "b",
    });
  });

  it("never touches the base and idles when partially filled", () => {
    expect(evaluateLounges([base(1)], RULES, false)).toEqual({ kind: "none" });
  });
});
