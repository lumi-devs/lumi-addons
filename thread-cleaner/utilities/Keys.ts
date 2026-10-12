export const THREAD_STATE_KEY = "thread-state";
export const CLEANUP_ONESHOT = "cleanup";

export interface ThreadState {
  parentId: string;
  action: "archive" | "lock";
  scheduledAt: number;
  dueAt: number;
  status: "pending" | "completed";
}
