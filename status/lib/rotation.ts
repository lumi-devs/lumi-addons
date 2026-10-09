export interface PlaceholderStats {
  guilds: number;
  users: number;
}

export function resolvePlaceholders(
  text: string,
  stats: PlaceholderStats,
): string {
  return text
    .replaceAll("{guilds}", String(stats.guilds))
    .replaceAll("{users}", String(stats.users));
}

export function isDue(
  state: { enabled: boolean; nextAtMs: number },
  now: number,
): boolean {
  return state.enabled && now >= state.nextAtMs;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Pop the next entry id, refilling from a shuffle of `allIds` when empty. */
export function nextFromQueue(
  queue: number[],
  allIds: number[],
  lastId: number | null,
): { next: number; queue: number[] } {
  const live = queue.filter((id) => allIds.includes(id));

  if (live.length === 0) {
    const refill = shuffle(allIds);
    if (refill.length > 1 && refill[0] === lastId) {
      const j = 1 + Math.floor(Math.random() * (refill.length - 1));
      [refill[0], refill[j]] = [refill[j]!, refill[0]!];
    }
    const [next, ...rest] = refill;
    return { next: next!, queue: rest };
  }

  const [next, ...rest] = live;
  return { next: next!, queue: rest };
}
