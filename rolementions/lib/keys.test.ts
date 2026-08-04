import { describe, it, expect } from "vitest";
import { dayStamp, RmKeys, COUNT_TTL_SECONDS } from "./keys.js";

describe("dayStamp", () => {
  it("formats a date as a UTC YYYY-MM-DD stamp", () => {
    expect(dayStamp(new Date("2024-03-05T23:59:59Z"))).toBe("2024-03-05");
  });

  it("rolls over at UTC midnight", () => {
    expect(dayStamp(new Date("2024-03-05T00:00:00Z"))).toBe("2024-03-05");
    expect(dayStamp(new Date("2024-03-04T23:59:59Z"))).toBe("2024-03-04");
  });

  it("defaults to the current date when none is given", () => {
    expect(dayStamp()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("RmKeys", () => {
  it("builds a per-guild, per-day count key", () => {
    expect(RmKeys.count("g1", "2024-03-05")).toBe(
      "ember:rolementions:count:g1:2024-03-05",
    );
  });

  it("defaults the count key to today's day stamp", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(RmKeys.count("g1")).toBe(`ember:rolementions:count:g1:${today}`);
  });

  it("builds a per-guild blocks key", () => {
    expect(RmKeys.blocks("g1")).toBe("ember:rolementions:blocks:g1");
  });

  it("builds a per-guild rule id key", () => {
    expect(RmKeys.ruleId("g1")).toBe("ember:rolementions:rule:g1");
  });
});

describe("COUNT_TTL_SECONDS", () => {
  it("is longer than a day so counters survive past UTC midnight", () => {
    expect(COUNT_TTL_SECONDS).toBeGreaterThan(24 * 60 * 60);
  });
});
