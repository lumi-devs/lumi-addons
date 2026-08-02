import { describe, expect, it } from "bun:test";
import { nextFromQueue, resolvePlaceholders } from "./rotation.js";

describe("nextFromQueue", () => {
  it("pops the head of a non-empty queue", () => {
    const r = nextFromQueue([2, 3], [1, 2, 3], 1);
    expect(r.next).toBe(2);
    expect(r.queue).toEqual([3]);
  });

  it("refills and shuffles when the queue is empty", () => {
    const r = nextFromQueue([], [1, 2, 3], null);
    expect([1, 2, 3]).toContain(r.next);
    expect(r.queue.length).toBe(2);
    expect(new Set([r.next, ...r.queue])).toEqual(new Set([1, 2, 3]));
  });

  it("never repeats the last id back-to-back when alternatives exist", () => {
    for (let i = 0; i < 50; i++) {
      const r = nextFromQueue([], [1, 2], 2);
      expect(r.next).toBe(1);
    }
  });

  it("allows a repeat when it is the only entry", () => {
    const r = nextFromQueue([], [7], 7);
    expect(r.next).toBe(7);
  });

  it("drops queued ids that no longer exist", () => {
    const r = nextFromQueue([9, 2], [1, 2], 1);
    expect(r.next).toBe(2);
  });
});

describe("resolvePlaceholders", () => {
  it("substitutes {guilds}, {users} and {shard}", () => {
    expect(
      resolvePlaceholders("on {guilds} servers, {users} users, shard {shard}", {
        guilds: 3,
        users: 1500,
        shard: 0,
      }),
    ).toBe("on 3 servers, 1500 users, shard 0");
  });

  it("leaves text without placeholders untouched", () => {
    expect(
      resolvePlaceholders("hello", { guilds: 1, users: 1, shard: 0 }),
    ).toBe("hello");
  });
});
