import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashAuthor, hmacUserId, openSealedId, sealUserId } from "./Anon.js";
import { authorKeyForIdxKey, confessionAuthorIdxKey, confessionTarget, replyKey } from "./Keys.js";

beforeAll(() => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "confessions-test-"));
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

  it("targets and keys are properly formatted", () => {
    expect(confessionTarget(42)).toBe("c:42");
    expect(replyKey(7)).toBe("r:7");
  });

  it("seal/open round-trips a user id and seals are non-deterministic", () => {
    const a = sealUserId("123456789012345678");
    const b = sealUserId("123456789012345678");
    expect(a).not.toBe(b);
    expect(openSealedId(a)).toBe("123456789012345678");
    expect(openSealedId(b)).toBe("123456789012345678");
  });

  it("openSealedId rejects plaintext and tampering", () => {
    expect(openSealedId("123456789012345678")).toBeNull();
    const sealed = sealUserId("123456789012345678");
    expect(openSealedId(`${sealed}x`)).toBeNull();
    expect(openSealedId("v9.aaaa.bbbb")).toBeNull();
    expect(openSealedId("")).toBeNull();
  });

  it("hmacUserId is deterministic 64 hex and distinct per user", () => {
    expect(hmacUserId("123")).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacUserId("123")).toBe(hmacUserId("123"));
    expect(hmacUserId("123")).not.toBe(hmacUserId("124"));
  });

  it("author idx keys map back to author keys", () => {
    expect(authorKeyForIdxKey(confessionAuthorIdxKey(7))).toBe("author:c:7");
    expect(authorKeyForIdxKey("author:c:7")).toBeNull();
  });
});
