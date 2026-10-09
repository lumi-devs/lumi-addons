import { describe, it, expect } from "vitest";
import {
  dayStamp,
  countTarget,
  COUNT_KEY,
  PROTECTED_KEY,
  BLOCK_KEY,
  EXPIRE_TASK,
} from "./keys.js";

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

describe("countTarget", () => {
  it("scopes a role counter to its UTC day", () => {
    expect(countTarget("2024-03-05", "123")).toBe("2024-03-05:123");
  });

  it("differs between days and roles", () => {
    expect(countTarget("2024-03-05", "123")).not.toBe(
      countTarget("2024-03-06", "123"),
    );
    expect(countTarget("2024-03-05", "123")).not.toBe(
      countTarget("2024-03-05", "456"),
    );
  });
});

describe("KV layout", () => {
  it("uses distinct keys for counts, protected roles, and blocks", () => {
    expect(new Set([COUNT_KEY, PROTECTED_KEY, BLOCK_KEY]).size).toBe(3);
  });

  it("names the expiry task after the addon", () => {
    expect(EXPIRE_TASK).toBe("rolementions:expire");
  });
});
