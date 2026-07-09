// Pure decision helpers for the bulk "sweep all prior threads" operation, kept
// dependency-free so they're unit-testable without a Discord client.

export type SweepVerdict = "delete" | "keep";

/**
 * Decide a thread's fate from its message count. Threads at or below the
 * threshold (empty or barely-used) are deleted; the rest are kept.
 */
export function sweepVerdict(
  messageCount: number,
  minMessages: number,
): SweepVerdict {
  return messageCount <= minMessages ? "delete" : "keep";
}

export interface SweepTotals {
  scanned: number;
  deleted: number;
  kept: number;
  stripped: number;
  failed: number;
}

export const emptyTotals = (): SweepTotals => ({
  scanned: 0,
  deleted: 0,
  kept: 0,
  stripped: 0,
  failed: 0,
});
