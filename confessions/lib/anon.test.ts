import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { setRpcTransport } from "lumi";
import { hashAuthor, replyLabel, sanitizeAttachmentUrl } from "./anon.js";
import { confessionTarget, replyKey } from "../keys.js";

setRpcTransport({
  currentInvocation: () => undefined,
  runWithInvocation: (_id, fn) => fn(),
  send: async (envelope) => {
    if (envelope.action === "util.sha256Hex")
      return createHash("sha256")
        .update((envelope.data as { text: string }).text, "utf8")
        .digest("hex");
    throw new Error(`unexpected host call ${envelope.action}`);
  },
});

describe("anon", () => {
  it("hashAuthor is deterministic per (salt, user) and 64 hex chars", async () => {
    const h = await hashAuthor("salt", "123");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    await expect(hashAuthor("salt", "123")).resolves.toBe(h);
  });

  it("hashAuthor changes with salt and with user", async () => {
    await expect(hashAuthor("saltA", "123")).resolves.not.toBe(await hashAuthor("saltB", "123"));
    await expect(hashAuthor("salt", "123")).resolves.not.toBe(await hashAuthor("salt", "124"));
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

  it("targets and keys are properly formatted", () => {
    expect(confessionTarget(42)).toBe("c:42");
    expect(replyKey(7)).toBe("r:7");
  });
});
