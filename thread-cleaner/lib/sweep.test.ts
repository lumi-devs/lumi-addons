import { describe, it, expect } from "vitest";
import { sweepVerdict, emptyTotals } from "./sweep.js";

describe("sweepVerdict", () => {
  it("deletes empty threads", () => {
    expect(sweepVerdict(0, 1)).toBe("delete");
  });

  it("deletes threads at or below the threshold", () => {
    expect(sweepVerdict(1, 1)).toBe("delete");
    expect(sweepVerdict(3, 3)).toBe("delete");
  });

  it("keeps threads above the threshold", () => {
    expect(sweepVerdict(2, 1)).toBe("keep");
    expect(sweepVerdict(50, 5)).toBe("keep");
  });

  it("with threshold 0, only truly empty threads are deleted", () => {
    expect(sweepVerdict(0, 0)).toBe("delete");
    expect(sweepVerdict(1, 0)).toBe("keep");
  });
});

describe("emptyTotals", () => {
  it("starts all counters at zero", () => {
    expect(emptyTotals()).toEqual({
      scanned: 0,
      deleted: 0,
      kept: 0,
      stripped: 0,
      failed: 0,
    });
  });
});
