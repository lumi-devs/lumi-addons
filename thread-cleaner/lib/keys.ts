/** Stable BullMQ job id for a thread's cleanup job — idempotent per thread. */
export const threadCleanupJobId = (threadId: string) =>
  `thread-cleaner:${threadId}`;
