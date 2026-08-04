import { describe, it, expect } from "vitest";
import { threadCleanupJobId } from "./keys.js";

describe("threadCleanupJobId", () => {
  it("builds a stable, thread-scoped job id", () => {
    expect(threadCleanupJobId("123")).toBe("thread-cleaner:123");
  });

  it("is idempotent for the same thread id", () => {
    expect(threadCleanupJobId("123")).toBe(threadCleanupJobId("123"));
  });

  it("differs between threads", () => {
    expect(threadCleanupJobId("123")).not.toBe(threadCleanupJobId("456"));
  });
});
