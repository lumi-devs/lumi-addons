import { describe, expect, it } from "bun:test";
import { loungeName, nextFreeNumber, allBusy } from "../data.js";

describe("loungeName", () => {
  it("replaces {n} with number", () => {
    expect(loungeName("Lounge {n}", 1)).toBe("Lounge 1");
    expect(loungeName("Lounge {n}", 42)).toBe("Lounge 42");
  });

  it("replaces multiple {n} occurrences", () => {
    expect(loungeName("#{n} Lounge {n}", 3)).toBe("#3 Lounge 3");
  });

  it("handles template without {n}", () => {
    expect(loungeName("Static Name", 5)).toBe("Static Name");
  });

  it("handles empty template", () => {
    expect(loungeName("", 1)).toBe("");
  });
});

describe("nextFreeNumber", () => {
  it("returns 1 for empty array", () => {
    expect(nextFreeNumber([])).toBe(1);
  });

  it("returns 1 when 1 is not used", () => {
    expect(nextFreeNumber([2, 3, 4])).toBe(1);
  });

  it("finds first gap in sequential numbers", () => {
    expect(nextFreeNumber([1, 2, 4, 5])).toBe(3);
  });

  it("returns next number when all sequential", () => {
    expect(nextFreeNumber([1, 2, 3])).toBe(4);
  });

  it("handles duplicates in input", () => {
    expect(nextFreeNumber([1, 1, 2, 3])).toBe(4);
  });

  it("handles unsorted input", () => {
    expect(nextFreeNumber([5, 1, 3])).toBe(2);
  });

  it("handles large numbers", () => {
    expect(nextFreeNumber([1, 2, 999])).toBe(3);
  });
});

describe("allBusy", () => {
  it("returns false for empty counts", () => {
    expect(allBusy([], 2)).toBe(false);
  });

  it("returns true when all counts meet threshold", () => {
    expect(allBusy([2, 2, 3], 2)).toBe(true);
  });

  it("returns false when any count below threshold", () => {
    expect(allBusy([2, 1, 3], 2)).toBe(false);
  });

  it("returns true when single count meets threshold", () => {
    expect(allBusy([5], 3)).toBe(true);
  });

  it("returns false when single count below threshold", () => {
    expect(allBusy([2], 3)).toBe(false);
  });
});