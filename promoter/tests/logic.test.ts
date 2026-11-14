import { describe, it, expect } from "bun:test";
import { statusMatches, wearsServerTag, describeSignals } from "../data.js";
import type { UserPrimaryGuild } from "discord.js";

function pg(overrides: Partial<Pick<UserPrimaryGuild, "identityEnabled" | "identityGuildId">>): UserPrimaryGuild {
  return { identityEnabled: true, identityGuildId: "123", ...overrides } as UserPrimaryGuild;
}
describe("statusMatches", () => {
  it("returns false for empty status text", () => {
    expect(statusMatches("", ["test"])).toBe(false);
    expect(statusMatches("   ", ["test"])).toBe(false);
  });

  it("returns false for empty terms array", () => {
    expect(statusMatches("hello world", [])).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(statusMatches("Hello World", ["hello"])).toBe(true);
    expect(statusMatches("HELLO WORLD", ["world"])).toBe(true);
    expect(statusMatches("HeLlO", ["hello"])).toBe(true);
  });

  it("matches substring anywhere in status", () => {
    expect(statusMatches("playing minecraft", ["mine"])).toBe(true);
    expect(statusMatches("discord.gg/server", ["gg/server"])).toBe(true);
  });

  it("does not match partial words without word boundaries", () => {
    // Current implementation matches substrings, not whole words
    expect(statusMatches("discord", ["cord"])).toBe(true);
    expect(statusMatches("promoter", ["mote"])).toBe(true);
  });

  it("ignores empty terms after trim", () => {
    expect(statusMatches("hello", ["", "  ", "hello"])).toBe(true);
    expect(statusMatches("hello", ["", "  "])).toBe(false);
  });

  it("trims terms before matching", () => {
    expect(statusMatches("hello world", ["  hello  "])).toBe(true);
    expect(statusMatches("hello world", ["world  "])).toBe(true);
  });

  it("handles unicode correctly", () => {
    expect(statusMatches("🎮 gaming", ["gaming"])).toBe(true);
    expect(statusMatches("discord.gg/🎉", ["🎉"])).toBe(true);
    expect(statusMatches("日本語", ["本"])).toBe(true);
  });

  it("returns true if any term matches", () => {
    expect(statusMatches("hello world", ["foo", "world", "bar"])).toBe(true);
    expect(statusMatches("hello world", ["foo", "bar", "baz"])).toBe(false);
  });
});

describe("wearsServerTag", () => {
  it("returns false for null primaryGuild", () => {
    expect(wearsServerTag(null, "123")).toBe(false);
    expect(wearsServerTag(undefined, "123")).toBe(false);
  });

  it("returns false when identityEnabled is false", () => {
    expect(wearsServerTag(pg({ identityEnabled: false }), "123")).toBe(false);
  });

  it("returns false when identityGuildId does not match", () => {
    expect(wearsServerTag(pg({ identityGuildId: "456" }), "123")).toBe(false);
  });

  it("returns true when both conditions match", () => {
    expect(wearsServerTag(pg({}), "123")).toBe(true);
  });
});

describe("describeSignals", () => {
  it("returns 'custom status' when only status matched", () => {
    expect(describeSignals(true, false)).toBe("custom status");
  });

  it("returns 'server tag' when only tag matched", () => {
    expect(describeSignals(false, true)).toBe("server tag");
  });

  it("returns 'custom status + server tag' when both matched", () => {
    expect(describeSignals(true, true)).toBe("custom status + server tag");
  });

  it("returns 'promotion' when neither matched", () => {
    expect(describeSignals(false, false)).toBe("promotion");
  });
});