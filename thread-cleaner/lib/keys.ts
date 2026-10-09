export const MODULE_NAME = "thread-cleaner";
export const CLEANUP_TASK = "thread-cleaner-task";
export const THREAD_STATE_KEY = "thread-state";

export interface ThreadState {
  parentId: string;
  action: "archive" | "lock";
  scheduledAt: number;
  dueAt: number;
  status: "pending" | "completed";
}
