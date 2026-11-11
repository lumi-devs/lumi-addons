import { describe, expect, it } from "bun:test";
import { defaultState, type RotationState } from "../data.js";
import {
  formatDurationSeconds,
  parseDurationSeconds,
  pickController,
  resolvePlaceholders,
  sanitizeStatusText,
} from "../logic.js";

function state(overrides: Partial<RotationState>): RotationState {
  return { ...defaultState(), ...overrides };
}

describe("parseDurationSeconds", () => {
  it("parses single units", () => {
    expect(parseDurationSeconds("30s")).toBe(30);
    expect(parseDurationSeconds("5m")).toBe(300);
    expect(parseDurationSeconds("1h")).toBe(3_600);
  });

  it("parses compound durations", () => {
    expect(parseDurationSeconds("1h30m")).toBe(5_400);
  });

  it("rejects unsupported or malformed input", () => {
    expect(parseDurationSeconds("")).toBeNull();
    expect(parseDurationSeconds("5")).toBeNull();
    expect(parseDurationSeconds("1d")).toBeNull();
    expect(parseDurationSeconds("soon")).toBeNull();
  });
});

describe("formatDurationSeconds", () => {
  it("formats whole units", () => {
    expect(formatDurationSeconds(30)).toBe("30s");
    expect(formatDurationSeconds(300)).toBe("5m");
    expect(formatDurationSeconds(5_400)).toBe("1h 30m");
  });
});

describe("sanitizeStatusText", () => {
  it("strips control characters and collapses whitespace", () => {
    expect(sanitizeStatusText("  hello\nworld\u0000  ")).toBe("hello world");
  });

  it("caps text at 128 characters", () => {
    expect(sanitizeStatusText("x".repeat(200))).toHaveLength(128);
  });
});

describe("resolvePlaceholders", () => {
  it("substitutes live counts", () => {
    expect(
      resolvePlaceholders("in {guilds} servers for {users} users", {
        guilds: 3,
        users: 1_500,
      }),
    ).toBe("in 3 servers for 1500 users");
  });
});

describe("pickController", () => {
  it("selects the enabled state with the most recent activation", () => {
    const controller = pickController([
      { guildId: "a", value: state({ enabled: true, activatedAt: 100 }) },
      { guildId: "b", value: state({ enabled: false, activatedAt: 300 }) },
      { guildId: "c", value: state({ enabled: true, activatedAt: 200 }) },
    ]);
    expect(controller?.guildId).toBe("c");
  });

  it("returns null when nothing is enabled", () => {
    expect(
      pickController([{ guildId: "a", value: state({ enabled: false }) }]),
    ).toBeNull();
  });
});