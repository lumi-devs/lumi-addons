import { describe, it, expect } from "vitest";
import {
  resolveRouletteBet,
  rouletteColor,
  spinRoulette,
} from "./roulette.js";

describe("roulette", () => {
  it("colors zero green, reds red, the rest black", () => {
    expect(rouletteColor(0)).toBe("green");
    expect(rouletteColor(7)).toBe("red");
    expect(rouletteColor(8)).toBe("black");
    expect(rouletteColor(36)).toBe("red");
  });

  it("spins within 0-36", () => {
    expect(spinRoulette(() => 0)).toBe(0);
    expect(spinRoulette(() => 0.9999)).toBe(36);
  });

  it("pays even money on red/black", () => {
    expect(resolveRouletteBet("red", 7, null, 50)).toMatchObject({
      won: true,
      profit: 50,
    });
    expect(resolveRouletteBet("red", 8, null, 50)).toMatchObject({
      won: false,
      profit: 0,
    });
    expect(resolveRouletteBet("black", 8, null, 50).won).toBe(true);
  });

  it("zero loses every even-money bet", () => {
    for (const type of ["red", "black", "odd", "even", "low", "high"] as const) {
      expect(resolveRouletteBet(type, 0, null, 50).won).toBe(false);
    }
  });

  it("handles odd/even/low/high boundaries", () => {
    expect(resolveRouletteBet("odd", 7, null, 10).won).toBe(true);
    expect(resolveRouletteBet("even", 8, null, 10).won).toBe(true);
    expect(resolveRouletteBet("low", 18, null, 10).won).toBe(true);
    expect(resolveRouletteBet("low", 19, null, 10).won).toBe(false);
    expect(resolveRouletteBet("high", 19, null, 10).won).toBe(true);
    expect(resolveRouletteBet("high", 36, null, 10).won).toBe(true);
  });

  it("pays 35 to 1 on green and exact numbers", () => {
    expect(resolveRouletteBet("green", 0, null, 10)).toMatchObject({
      won: true,
      profit: 350,
    });
    expect(resolveRouletteBet("green", 1, null, 10).won).toBe(false);
    expect(resolveRouletteBet("number", 17, 17, 10)).toMatchObject({
      won: true,
      profit: 350,
    });
    expect(resolveRouletteBet("number", 18, 17, 10).won).toBe(false);
    expect(resolveRouletteBet("number", 17, null, 10).won).toBe(false);
  });
});
