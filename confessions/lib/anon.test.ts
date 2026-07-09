import { describe, it, expect } from "vitest";
import { hashAuthor, replyLabel, sanitizeAttachmentUrl } from "./anon.js";

describe("anon", () => {
  it("hashAuthor is deterministic per (salt, user) and 64 hex chars", () => {
    const h = hashAuthor("salt", "123");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAuthor("salt", "123")).toBe(h);
  });

  it("hashAuthor changes with salt and with user", () => {
    expect(hashAuthor("saltA", "123")).not.toBe(hashAuthor("saltB", "123"));
    expect(hashAuthor("salt", "123")).not.toBe(hashAuthor("salt", "124"));
  });

  it("replyLabel formats N.k", () => {
    expect(replyLabel(7, 3)).toBe("#7.3");
  });

  it("sanitizeAttachmentUrl accepts http(s) and rejects the rest", () => {
    expect(sanitizeAttachmentUrl(" https://x.png ")).toBe("https://x.png");
    expect(sanitizeAttachmentUrl("http://a/b")).toBe("http://a/b");
    expect(sanitizeAttachmentUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeAttachmentUrl("not a url")).toBeNull();
    expect(sanitizeAttachmentUrl("")).toBeNull();
  });
});
