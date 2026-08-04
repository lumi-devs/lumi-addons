import { describe, it, expect, vi } from "vitest";
import type { Guild } from "discord.js";
import {
  parseMinutes,
  formatMinutes,
  formatRemaining,
  roleLabel,
} from "./format.js";

describe("parseMinutes", () => {
  it("accepts a bare number as minutes", () => {
    expect(parseMinutes("60")).toBe(60);
  });

  it("accepts unit suffixes", () => {
    expect(parseMinutes("90m")).toBe(90);
    expect(parseMinutes("2h")).toBe(120);
    expect(parseMinutes("1d")).toBe(1440);
    expect(parseMinutes("2hr")).toBe(120);
    expect(parseMinutes("3hours")).toBe(180);
    expect(parseMinutes("1day")).toBe(1440);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(parseMinutes("  2H  ")).toBe(120);
  });

  it("returns null for unparseable or non-positive input", () => {
    expect(parseMinutes("")).toBeNull();
    expect(parseMinutes("abc")).toBeNull();
    expect(parseMinutes("0")).toBeNull();
    expect(parseMinutes("-5m")).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("formats a compact human duration", () => {
    expect(formatMinutes(150)).toBe("2h 30m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(1440)).toBe("1d");
    expect(formatMinutes(1470)).toBe("1d 30m");
  });

  it("returns 0m for zero or negative input", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(-10)).toBe("0m");
  });
});

describe("formatRemaining", () => {
  it("returns 'expired' once the timestamp has passed", () => {
    expect(formatRemaining(Date.now() - 1)).toBe("expired");
  });

  it("formats the remaining time up to the expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    expect(formatRemaining(90 * 60_000)).toBe("1h 30m");
    vi.useRealTimers();
  });
});

describe("roleLabel", () => {
  const guildWith = (roles: Record<string, { name: string }>): Guild =>
    ({
      roles: { cache: new Map(Object.entries(roles)) },
    }) as unknown as Guild;

  it("labels a known role with its live name", () => {
    const guild = guildWith({ "1": { name: "Mods" } });
    expect(roleLabel(guild, "1")).toBe("**Mods** (`1`)");
  });

  it("falls back to the cached name when the role is gone", () => {
    const guild = guildWith({});
    expect(roleLabel(guild, "1", "Old Mods")).toBe("**Old Mods** (`1`)");
  });

  it("falls back to 'Unknown Role' with no cached name", () => {
    const guild = guildWith({});
    expect(roleLabel(guild, "1")).toBe("**Unknown Role** (`1`)");
  });
});
