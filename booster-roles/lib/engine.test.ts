import { describe, it, expect } from "vitest";
import { validateRoleName, parseHexColor, colorToHex, isBoosterEligible } from "./engine.js";

describe("validateRoleName", () => {
  it("accepts a normal name and trims it", () => {
    expect(validateRoleName("  Sparkle  ", 32)).toEqual({
      ok: true,
      value: "Sparkle",
    });
  });

  it("rejects empty / whitespace-only names", () => {
    expect(validateRoleName("   ", 32).ok).toBe(false);
  });

  it("rejects names longer than the max", () => {
    expect(validateRoleName("x".repeat(33), 32).ok).toBe(false);
    expect(validateRoleName("x".repeat(32), 32).ok).toBe(true);
  });

  it("rejects @everyone / @here regardless of leading @", () => {
    expect(validateRoleName("@everyone", 32).ok).toBe(false);
    expect(validateRoleName("here", 32).ok).toBe(false);
    expect(validateRoleName("@@everyone", 32).ok).toBe(false);
  });
});

describe("parseHexColor", () => {
  it("parses #RRGGBB, RRGGBB and 0xRRGGBB", () => {
    expect(parseHexColor("#ff8800")).toBe(0xff8800);
    expect(parseHexColor("ff8800")).toBe(0xff8800);
    expect(parseHexColor("0xFF8800")).toBe(0xff8800);
  });

  it("expands #RGB shorthand", () => {
    expect(parseHexColor("#f80")).toBe(0xff8800);
  });

  it("returns null on garbage", () => {
    expect(parseHexColor("not-a-color")).toBeNull();
    expect(parseHexColor("#12")).toBeNull();
    expect(parseHexColor("#1234567")).toBeNull();
  });
});

describe("colorToHex", () => {
  it("round-trips with parseHexColor and zero-pads", () => {
    expect(colorToHex(0xff8800)).toBe("#FF8800");
    expect(colorToHex(0x000000)).toBe("#000000");
    expect(colorToHex(parseHexColor("#0a0b0c")!)).toBe("#0A0B0C");
  });
});

describe("isBoosterEligible", () => {
  it("returns true if member has premiumSince timestamp", () => {
    expect(isBoosterEligible([], 12345678, ["role-booster-1"])).toBe(true);
  });

  it("returns true if member has one of qualifying boosterRoleIds", () => {
    expect(isBoosterEligible(["role-booster-2"], null, ["role-booster-1", "role-booster-2"])).toBe(true);
  });

  it("returns false if member has neither", () => {
    expect(isBoosterEligible(["some-other-role"], null, ["role-booster-1", "role-booster-2"])).toBe(false);
  });

  it("returns false if qualifying roles empty and not premium booster", () => {
    expect(isBoosterEligible(["role-booster-1"], null, [])).toBe(false);
  });
});
