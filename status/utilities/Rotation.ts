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
    const target = a[j];
    const current = a[i];
    if (target !== undefined && current !== undefined) {
      a[i] = target;
      a[j] = current;
    }
  }
  return a;
}

export function nextFromQueue(
  queue: number[],
  allIds: number[],
  lastId: number | null,
): { next: number; queue: number[] } {
  const live = queue.filter((id) => allIds.includes(id));

  if (live.length === 0) {
    const refill = shuffle(allIds);
    const first = refill[0];
    if (refill.length > 1 && first === lastId) {
      const j = 1 + Math.floor(Math.random() * (refill.length - 1));
      const target = refill[j];
      if (first !== undefined && target !== undefined) {
        refill[0] = target;
        refill[j] = first;
      }
    }
    const [next, ...rest] = refill;
    return { next: next ?? 0, queue: rest };
  }

  const [next, ...rest] = live;
  return { next: next ?? 0, queue: rest };
}
