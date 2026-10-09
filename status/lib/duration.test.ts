import { describe, expect, it } from "vitest";
import { formatDurationMs, parseDurationMs } from "./duration.js";

describe("parseDurationMs", () => {
  it("parses single units", () => {
    expect(parseDurationMs("2m")).toBe(120_000);
    expect(parseDurationMs("30s")).toBe(30_000);
    expect(parseDurationMs("1h")).toBe(3_600_000);
  });

  it("parses combined durations", () => {
    expect(parseDurationMs("1h30m")).toBe(5_400_000);
  });

  it("treats bare digits as milliseconds", () => {
    expect(parseDurationMs("90000")).toBe(90_000);
  });

  it("rejects garbage", () => {
    expect(parseDurationMs("")).toBeNull();
    expect(parseDurationMs("soon")).toBeNull();
    expect(parseDurationMs("2m tomorrow")).toBeNull();
  });
});

describe("formatDurationMs", () => {
  it("formats back to units", () => {
    expect(formatDurationMs(120_000)).toBe("2m");
    expect(formatDurationMs(5_400_000)).toBe("1h 30m");
  });
});
