import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  incrementMentions,
  getCounts,
  getRoleCount,
  resetCounts,
  setProtectedRole,
  removeProtectedRole,
  getProtectedRoles,
  getBlock,
  getBlocks,
  setBlock,
  removeBlock,
} from "./store.js";
import { COUNT_KEY, PROTECTED_KEY, BLOCK_KEY, dayStamp } from "./keys.js";

const mockKv = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  incr: vi.fn(),
};

vi.mock("lumi/kv", () => ({
  get: (...args: unknown[]) => mockKv.get(...args),
  set: (...args: unknown[]) => mockKv.set(...args),
  remove: (...args: unknown[]) => mockKv.remove(...args),
  list: (...args: unknown[]) => mockKv.list(...args),
  incr: (...args: unknown[]) => mockKv.incr(...args),
}));

describe("store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("incrementMentions", () => {
    it("increments mention count for each role on today's stamp", async () => {
      mockKv.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
      const res = await incrementMentions("guild-1", ["role-a", "role-b"]);

      const today = dayStamp();
      expect(mockKv.incr).toHaveBeenCalledWith("guild-1", `${today}:role-a`, COUNT_KEY, 1);
      expect(mockKv.incr).toHaveBeenCalledWith("guild-1", `${today}:role-b`, COUNT_KEY, 1);
      expect(res.get("role-a")).toBe(1);
      expect(res.get("role-b")).toBe(3);
    });

    it("returns empty map on empty input", async () => {
      const res = await incrementMentions("guild-1", []);
      expect(res.size).toBe(0);
      expect(mockKv.incr).not.toHaveBeenCalled();
    });
  });

  describe("getCounts", () => {
    it("returns active counts and cleans up stale days", async () => {
      const today = dayStamp();
      mockKv.list.mockResolvedValueOnce([
        { targetId: `${today}:role-1`, value: 5 },
        { targetId: "2020-01-01:role-old", value: 10 },
        { targetId: "malformed", value: 2 },
      ]);

      const counts = await getCounts("guild-1");
      expect(counts.get("role-1")).toBe(5);
      expect(counts.has("role-old")).toBe(false);
      expect(mockKv.remove).toHaveBeenCalledWith("guild-1", "2020-01-01:role-old", COUNT_KEY);
      expect(mockKv.remove).toHaveBeenCalledWith("guild-1", "malformed", COUNT_KEY);
    });
  });

  describe("getRoleCount", () => {
    it("returns parsed number or 0 when absent", async () => {
      mockKv.get.mockResolvedValueOnce(7);
      expect(await getRoleCount("guild-1", "role-1")).toBe(7);

      mockKv.get.mockResolvedValueOnce(null);
      expect(await getRoleCount("guild-1", "role-2")).toBe(0);
    });
  });

  describe("resetCounts", () => {
    it("removes all count rows for guild", async () => {
      mockKv.list.mockResolvedValueOnce([
        { targetId: "t1" },
        { targetId: "t2" },
      ]);
      await resetCounts("guild-1");
      expect(mockKv.remove).toHaveBeenCalledWith("guild-1", "t1", COUNT_KEY);
      expect(mockKv.remove).toHaveBeenCalledWith("guild-1", "t2", COUNT_KEY);
    });
  });

  describe("protected roles", () => {
    it("sets, removes, and lists protected roles", async () => {
      await setProtectedRole("guild-1", "role-1", 60);
      expect(mockKv.set).toHaveBeenCalledWith("guild-1", "role-1", PROTECTED_KEY, { durationMinutes: 60 });

      mockKv.remove.mockResolvedValueOnce(1);
      expect(await removeProtectedRole("guild-1", "role-1")).toBe(true);

      mockKv.list.mockResolvedValueOnce([
        { targetId: "role-1", value: { durationMinutes: 90 } },
      ]);
      const list = await getProtectedRoles("guild-1");
      expect(list.get("role-1")).toBe(90);
    });
  });

  describe("blocks", () => {
    it("returns null and deletes expired block on getBlock", async () => {
      mockKv.get.mockResolvedValueOnce({
        roleId: "role-1",
        expiresAt: Date.now() - 1000,
      });

      const block = await getBlock("guild-1", "role-1");
      expect(block).toBeNull();
      expect(mockKv.remove).toHaveBeenCalledWith("guild-1", "role-1", BLOCK_KEY);
    });

    it("returns valid active block on getBlock", async () => {
      const future = Date.now() + 60_000;
      mockKv.get.mockResolvedValueOnce({
        roleId: "role-1",
        expiresAt: future,
        durationMinutes: 60,
        manual: false,
      });

      const block = await getBlock("guild-1", "role-1");
      expect(block).not.toBeNull();
      expect(block?.roleId).toBe("role-1");
      expect(mockKv.remove).not.toHaveBeenCalled();
    });

    it("filters and deletes expired blocks on getBlocks", async () => {
      const now = Date.now();
      mockKv.list.mockResolvedValueOnce([
        { targetId: "active", value: { roleId: "active", expiresAt: now + 50_000 } },
        { targetId: "stale", value: { roleId: "stale", expiresAt: now - 50_000 } },
      ]);

      const blocks = await getBlocks("guild-1");
      expect(blocks.has("active")).toBe(true);
      expect(blocks.has("stale")).toBe(false);
      expect(mockKv.remove).toHaveBeenCalledWith("guild-1", "stale", BLOCK_KEY);
    });

    it("sets and removes blocks", async () => {
      const block = {
        roleId: "r1",
        createdAt: Date.now(),
        expiresAt: Date.now() + 10000,
        durationMinutes: 10,
        manual: true,
      };
      await setBlock("guild-1", block);
      expect(mockKv.set).toHaveBeenCalledWith("guild-1", "r1", BLOCK_KEY, block);

      mockKv.remove.mockResolvedValueOnce(1);
      expect(await removeBlock("guild-1", "r1")).toBe(true);
    });
  });
});
