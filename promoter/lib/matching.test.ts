import { describe, expect, it } from "vitest";
import { statusMatches, wearsServerTag } from "./matching.js";

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

describe("wearsServerTag", () => {
  it("is true only when the identity is enabled and points at this guild", () => {
    expect(
      wearsServerTag({ identityGuildId: "111", identityEnabled: true }, "111"),
    ).toBe(true);
  });

  it("is false otherwise", () => {
    expect(
      wearsServerTag({ identityGuildId: "222", identityEnabled: true }, "111"),
    ).toBe(false);
    expect(
      wearsServerTag({ identityGuildId: "111", identityEnabled: false }, "111"),
    ).toBe(false);
    expect(wearsServerTag(null, "111")).toBe(false);
  });
});
