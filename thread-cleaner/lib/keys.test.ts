import { describe, expect, it } from "vitest";
import { MODULE_NAME, CLEANUP_TASK, THREAD_STATE_KEY } from "./keys.js";

describe("thread-cleaner keys and constants", () => {
  it("defines standard module and task identifiers", () => {
    expect(MODULE_NAME).toBe("thread-cleaner");
    expect(CLEANUP_TASK).toBe("thread-cleaner-task");
    expect(THREAD_STATE_KEY).toBe("thread-state");
  });
});
