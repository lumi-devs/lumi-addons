import { describe, expect, it } from "bun:test";
import { statusMatches } from "./matching.js";

describe("statusMatches", () => {
  const terms = [".gg/lumi", "discord.gg/lumi", "LUMI"];

  it("matches case-insensitively", () => {
    expect(statusMatches("join Discord.GG/LUMI now!", terms)).toBe(true);
    expect(statusMatches("i love lumi", terms)).toBe(true);
  });

  it("rejects non-matching statuses", () => {
    expect(statusMatches("just vibing", terms)).toBe(false);
  });

  it("rejects empty status or empty terms", () => {
    expect(statusMatches("", terms)).toBe(false);
    expect(statusMatches("anything", [])).toBe(false);
  });

  it("ignores blank terms from sloppy config", () => {
    expect(statusMatches("hello", ["", "  "])).toBe(false);
  });
});
