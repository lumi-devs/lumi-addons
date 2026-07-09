import { describe, expect, it } from "bun:test";
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
  const guildId = "111";

  it("is true only when the identity is enabled and points at this guild", () => {
    expect(
      wearsServerTag(
        { identityEnabled: true, identityGuildId: "111" },
        guildId,
      ),
    ).toBe(true);
  });

  it("is false for another guild's tag", () => {
    expect(
      wearsServerTag(
        { identityEnabled: true, identityGuildId: "222" },
        guildId,
      ),
    ).toBe(false);
  });

  it("is false when the identity is disabled or absent", () => {
    expect(
      wearsServerTag(
        { identityEnabled: false, identityGuildId: "111" },
        guildId,
      ),
    ).toBe(false);
    expect(wearsServerTag(null, guildId)).toBe(false);
    expect(
      wearsServerTag({ identityEnabled: null, identityGuildId: null }, guildId),
    ).toBe(false);
  });
});
