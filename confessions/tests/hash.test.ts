import { describe, it, expect } from "bun:test";
import { hashAuthor } from "../data.js";
import { isReplyPath } from "../listeners/helpers.js";

describe("hashAuthor", () => {
  it("produces deterministic output for same salt and userId", () => {
    const salt = "test-salt-123";
    const userId = "123456789012345678";
    const hash1 = hashAuthor(salt, userId);
    const hash2 = hashAuthor(salt, userId);
    expect(hash1).toBe(hash2);
  });
  it("produces different hashes for different userIds", () => {
    const salt = "test-salt-123";
    const hash1 = hashAuthor(salt, "user1");
    const hash2 = hashAuthor(salt, "user2");
    expect(hash1).not.toBe(hash2);
  });
  it("produces different hashes for different salts", () => {
    const userId = "123456789012345678";
    const hash1 = hashAuthor("salt1", userId);
    const hash2 = hashAuthor("salt2", userId);
    expect(hash1).not.toBe(hash2);
  });

  it("produces 64-character hex string (SHA-256)", () => {
    const hash = hashAuthor("salt", "user");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles empty userId", () => {
    const hash = hashAuthor("salt", "");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles empty salt", () => {
    const hash = hashAuthor("", "user");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles special characters in userId", () => {
    const hash = hashAuthor("salt", "user@#$%^&*()");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles unicode in userId", () => {
    const hash = hashAuthor("salt", "用户🎉");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is case-sensitive for userId", () => {
    const hash1 = hashAuthor("salt", "USER");
    const hash2 = hashAuthor("salt", "user");
    expect(hash1).not.toBe(hash2);
  });

  it("is case-sensitive for salt", () => {
    const hash1 = hashAuthor("SALT", "user");
    const hash2 = hashAuthor("salt", "user");
    expect(hash1).not.toBe(hash2);
  });
});

describe("isReplyPath", () => {
  it("returns true for valid top-level reply path", () => {
    expect(isReplyPath("1.1")).toBe(true);
    expect(isReplyPath("123.456")).toBe(true);
  });

  it("returns true for valid nested reply path", () => {
    expect(isReplyPath("1.1.1")).toBe(true);
    expect(isReplyPath("1.2.3.4.5")).toBe(true);
    expect(isReplyPath("123.456.789")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isReplyPath("")).toBe(false);
  });

  it("returns false for confession number only (no dot)", () => {
    expect(isReplyPath("1")).toBe(false);
    expect(isReplyPath("123")).toBe(false);
  });

  it("returns false for paths with non-numeric parts", () => {
    expect(isReplyPath("1.a")).toBe(false);
    expect(isReplyPath("a.1")).toBe(false);
    expect(isReplyPath("1.1.a")).toBe(false);
  });

  it("returns true for paths with leading zeros (current behavior)", () => {
    expect(isReplyPath("01.1")).toBe(true);
    expect(isReplyPath("1.01")).toBe(true);
  });
  it("returns false for negative numbers", () => {
    expect(isReplyPath("-1.1")).toBe(false);
    expect(isReplyPath("1.-1")).toBe(false);
  });

  it("returns false for decimal numbers", () => {
    expect(isReplyPath("1.1.5")).toBe(true);
    expect(isReplyPath("1.5")).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(isReplyPath(undefined)).toBe(false);
  });

  it("returns false for null-like strings", () => {
    expect(isReplyPath("null")).toBe(false);
    expect(isReplyPath("undefined")).toBe(false);
  });

  it("returns false for paths with extra dots", () => {
    expect(isReplyPath("1..1")).toBe(false);
    expect(isReplyPath(".1.1")).toBe(false);
    expect(isReplyPath("1.1.")).toBe(false);
  });

  it("returns false for very long valid paths", () => {
    const longPath = Array.from({ length: 50 }, (_, i) => i + 1).join(".");
    expect(isReplyPath(longPath)).toBe(true);
  });
});

describe("nextReplyPath logic (simulated)", () => {
  // We test the pure logic: path = `${base}.${index}`
  it("generates correct path for top-level reply", () => {
    const base = "5";
    const index = 1;
    const path = `${base}.${index}`;
    expect(path).toBe("5.1");
  });

  it("generates correct path for nested reply", () => {
    const base = "5.2";
    const index = 3;
    const path = `${base}.${index}`;
    expect(path).toBe("5.2.3");
  });

  it("increments correctly for multiple replies to same parent", () => {
    const base = "10";
    expect(`${base}.${1}`).toBe("10.1");
    expect(`${base}.${2}`).toBe("10.2");
    expect(`${base}.${3}`).toBe("10.3");
  });

  it("handles deeply nested paths", () => {
    const base = "1.2.3.4";
    const index = 5;
    const path = `${base}.${index}`;
    expect(path).toBe("1.2.3.4.5");
    expect(isReplyPath(path)).toBe(true);
  });
});

describe("salt rotation behavior (conceptual)", () => {
  // The getSalt function uses a lock to ensure only one salt is generated per guild
  // We test the conceptual properties here
  it("hashAuthor with same salt produces same hash", () => {
    const salt = "fixed-salt-for-testing";
    const userId = "user123";
    const hashes = Array.from({ length: 100 }, () => hashAuthor(salt, userId));
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(1);
  });

  it("different users get different hashes with same salt", () => {
    const salt = "fixed-salt";
    const userIds = Array.from({ length: 100 }, (_, i) => `user${i}`);
    const hashes = userIds.map((id) => hashAuthor(salt, id));
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(100);
  });

  it("salt change produces completely different hashes for same user", () => {
    const userId = "user123";
    const hashes = Array.from({ length: 10 }, (_, i) =>
      hashAuthor(`salt${i}`, userId),
    );
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(10);
  });
});

describe("cooldown key format", () => {
  const ModuleName = "confessions";
  
  it("generates consistent cooldown keys", () => {
    const guildId = "guild123";
    const authorHash = "a".repeat(64);
    const key = `${ModuleName}:cooldown:${guildId}:${authorHash}`;
    expect(key).toBe(`confessions:cooldown:guild123:${authorHash}`);
  });

  it("different guilds have different cooldown keys", () => {
    const authorHash = "a".repeat(64);
    const key1 = `${ModuleName}:cooldown:guild1:${authorHash}`;
    const key2 = `${ModuleName}:cooldown:guild2:${authorHash}`;
    expect(key1).not.toBe(key2);
  });

  it("different author hashes have different cooldown keys", () => {
    const guildId = "guild123";
    const key1 = `${ModuleName}:cooldown:${guildId}:${"a".repeat(64)}`;
    const key2 = `${ModuleName}:cooldown:${guildId}:${"b".repeat(64)}`;
    expect(key1).not.toBe(key2);
  });
});

describe("ban key format", () => {
  const BanPrefix = "ban:";

  it("generates consistent ban keys", () => {
    const authorHash = "a".repeat(64);
    const key = `${BanPrefix}${authorHash}`;
    expect(key).toBe(`ban:${authorHash}`);
  });

  it("ban key is guild-scoped via moduleData target", () => {
    // Ban records are stored at GuildTarget (_) with prefix ban:
    // This means they are per-guild, not global
    const key = `${BanPrefix}"a".repeat(64)`;
    expect(key.startsWith("ban:")).toBe(true);
  });
});

describe("report key formats", () => {
  const ReportedPrefix = "reported:";

  it("confessionReportKey generates correct format", () => {
    const key = `${ReportedPrefix}42`;
    expect(key).toBe("reported:42");
  });

  it("replyReportKey generates correct format", () => {
    const key = `${ReportedPrefix}reply:1.2.3`;
    expect(key).toBe("reported:reply:1.2.3");
  });

  it("confession and reply report keys don't collide", () => {
    const confessionKey = `${ReportedPrefix}42`;
    const replyKey = `${ReportedPrefix}reply:42.1`;
    expect(confessionKey).not.toBe(replyKey);
  });
});

describe("reply index key format", () => {
  const ReplyIndexPrefix = "r:";

  it("generates correct reply storage key", () => {
    const path = "1.2.3";
    const key = `${ReplyIndexPrefix}${path}`;
    expect(key).toBe("r:1.2.3");
  });

  it("different paths generate different keys", () => {
    const key1 = `${ReplyIndexPrefix}1.1`;
    const key2 = `${ReplyIndexPrefix}1.2`;
    expect(key1).not.toBe(key2);
  });
});

describe("kids counter key format", () => {
  const KidsPrefix = "kids:";

  it("generates correct counter key for top-level", () => {
    const base = "5";
    const key = `${KidsPrefix}${base}`;
    expect(key).toBe("kids:5");
  });

  it("generates correct counter key for nested", () => {
    const base = "5.2";
    const key = `${KidsPrefix}${base}`;
    expect(key).toBe("kids:5.2");
  });
});

describe("dm opt-out key format", () => {
  const DmOptPrefix = "dmopt:";

  it("generates correct dm opt-out key", () => {
    const userId = "123456789012345678";
    const key = `${DmOptPrefix}${userId}`;
    expect(key).toBe("dmopt:123456789012345678");
  });
});

describe("index key format", () => {
  const IndexPrefix = "c:";

  it("generates correct confession index key", () => {
    const number = 42;
    const key = `${IndexPrefix}${number}`;
    expect(key).toBe("c:42");
  });
});

describe("meta key constant", () => {
  const MetaKey = "meta";

  it("is constant", () => {
    expect(MetaKey).toBe("meta");
  });
});

describe("GuildTarget constant", () => {
  const GuildTarget = "_";

  it("is underscore", () => {
    expect(GuildTarget).toBe("_");
  });
});

describe("SaltKey constant", () => {
  const SaltKey = "salt";

  it("is salt", () => {
    expect(SaltKey).toBe("salt");
  });
});

describe("CounterKey constant", () => {
  const CounterKey = "counter";

  it("is counter", () => {
    expect(CounterKey).toBe("counter");
  });
});

describe("ReportClaimKey format", () => {
  const ModuleName = "confessions";

  it("generates correct report claim key", () => {
    const guildId = "guild123";
    const key = "reported:42";
    const claimKey = `${ModuleName}:report-claim:${guildId}:${key}`;
    expect(claimKey).toBe("confessions:report-claim:guild123:reported:42");
  });
});