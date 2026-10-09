import { describe, it, expect } from "vitest";
import {
  emojiImageUrl,
  emojiMention,
  hasManageEmojiPermission,
  isHttpUrl,
  parseEmojis,
  parseMessageRef,
  sanitizeEmojiName,
} from "./emoji.js";

describe("parseEmojis", () => {
  it("extracts static and animated emojis", () => {
    expect(parseEmojis("hi <:pepe:123> <a:dance:456>")).toEqual([
      { animated: false, name: "pepe", id: "123" },
      { animated: true, name: "dance", id: "456" },
    ]);
  });

  it("dedupes by id across contents", () => {
    expect(parseEmojis("<:pepe:123>", "again <:pepe:123>")).toEqual([
      { animated: false, name: "pepe", id: "123" },
    ]);
  });

  it("returns [] for plain text", () => {
    expect(parseEmojis("just words", "")).toEqual([]);
  });
});

describe("sanitizeEmojiName", () => {
  it("strips invalid characters", () => {
    expect(sanitizeEmojiName("hello world!")).toBe("helloworld");
  });

  it("drops extensions and trims underscores", () => {
    expect(sanitizeEmojiName("cool.png")).toBe("cool");
    expect(sanitizeEmojiName("__x__")).toBe("emoji_x");
  });

  it("falls back for short or empty names", () => {
    expect(sanitizeEmojiName("a")).toBe("emoji_a");
    expect(sanitizeEmojiName("")).toBe("emoji_stolen");
  });

  it("caps at 32 characters", () => {
    expect(sanitizeEmojiName("a".repeat(40))).toBe("a".repeat(32));
  });
});

describe("parseMessageRef", () => {
  it("parses message links", () => {
    expect(
      parseMessageRef(
        "https://discord.com/channels/1/222/333",
        "999",
      ),
    ).toEqual({ channelId: "222", messageId: "333" });
  });

  it("treats bare ids as current-channel messages", () => {
    expect(parseMessageRef("123456789012345678", "999")).toEqual({
      channelId: "999",
      messageId: "123456789012345678",
    });
  });

  it("rejects anything else", () => {
    expect(parseMessageRef("<:pepe:123>", "999")).toBeNull();
    expect(parseMessageRef("https://example.com/x.png", "999")).toBeNull();
  });
});

describe("hasManageEmojiPermission", () => {
  it("accepts Manage Emojis (1<<30) and Administrator (1<<3)", () => {
    expect(hasManageEmojiPermission("1073741824")).toBe(true);
    expect(hasManageEmojiPermission("8")).toBe(true);
    expect(hasManageEmojiPermission("1073741832")).toBe(true);
  });

  it("rejects unrelated bitfields", () => {
    expect(hasManageEmojiPermission("0")).toBe(false);
    expect(hasManageEmojiPermission("1024")).toBe(false);
  });

  it("fails open on missing or malformed input", () => {
    expect(hasManageEmojiPermission(null)).toBe(true);
    expect(hasManageEmojiPermission("bogus")).toBe(true);
  });
});

describe("small helpers", () => {
  it("builds cdn urls and mentions", () => {
    expect(emojiImageUrl("123", false)).toBe(
      "https://cdn.discordapp.com/emojis/123.png",
    );
    expect(emojiImageUrl("123", true)).toBe(
      "https://cdn.discordapp.com/emojis/123.gif",
    );
    expect(emojiMention("pepe", "123", false)).toBe("<:pepe:123>");
    expect(emojiMention("dance", "456", true)).toBe("<a:dance:456>");
  });

  it("detects http urls", () => {
    expect(isHttpUrl("https://x/y.png")).toBe(true);
    expect(isHttpUrl("http://x/y.png")).toBe(true);
    expect(isHttpUrl("<:pepe:123>")).toBe(false);
  });
});
