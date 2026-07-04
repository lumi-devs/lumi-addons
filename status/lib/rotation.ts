// Pure rotation logic — no framework imports so `bun test` runs it standalone.

export interface PlaceholderStats {
  guilds: number;
  users: number;
  shard: number;
}

export function resolvePlaceholders(
  text: string,
  stats: PlaceholderStats,
): string {
  return text
    .replaceAll("{guilds}", String(stats.guilds))
    .replaceAll("{users}", String(stats.users))
    .replaceAll("{shard}", String(stats.shard));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Pop the next entry id to apply. `queue` holds ids not yet played this cycle;
 * when exhausted it is refilled with a shuffle of `allIds`, avoiding an
 * immediate repeat of `lastId` (unless it is the only entry). Ids in the queue
 * that no longer exist in `allIds` (removed entries) are skipped.
 */
export function nextFromQueue(
  queue: number[],
  allIds: number[],
  lastId: number | null,
): { next: number; queue: number[] } {
  const live = queue.filter((id) => allIds.includes(id));

  if (live.length === 0) {
    const refill = shuffle(allIds);
    if (refill.length > 1 && refill[0] === lastId) {
      // Swap the head with a random later slot so we never repeat back-to-back.
      const j = 1 + Math.floor(Math.random() * (refill.length - 1));
      [refill[0], refill[j]] = [refill[j]!, refill[0]!];
    }
    const [next, ...rest] = refill;
    return { next: next!, queue: rest };
  }

  const [next, ...rest] = live;
  return { next: next!, queue: rest };
}
