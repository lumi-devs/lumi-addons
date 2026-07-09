/**
 * Pure lounge-scaling logic — no Discord, no I/O, fully unit-testable.
 *
 * A "slot" is one managed voice channel (the base plus any bot-created extras).
 * The engine decides a single action per evaluation; the listener re-fires as
 * membership keeps changing, so one decision at a time keeps behaviour simple
 * and race-free.
 */
export interface LoungeSlot {
  channelId: string;
  /** Extra lounge ordinal from the name template; the base is `0`. */
  number: number;
  count: number;
  isBase: boolean;
}

export interface LoungeRules {
  busyThreshold: number;
  maxExtras: number;
  nameTemplate: string;
}

export type LoungeAction =
  | { kind: "create"; number: number }
  | { kind: "delete"; channelId: string }
  | { kind: "none" };

/** Render an extra lounge's name from the template (`{n}` → number). */
export function loungeName(template: string, n: number): string {
  return template.replaceAll("{n}", String(n));
}

/** Recover an extra lounge's number from its channel name, or null. */
export function parseLoungeNumber(
  template: string,
  name: string,
): number | null {
  const pattern = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace("\\{n\\}", "(\\d+)");
  const match = new RegExp(`^${pattern}$`).exec(name);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  return Number.isInteger(n) ? n : null;
}

/** Lowest positive integer not already used — keeps numbering contiguous. */
export function nextFreeNumber(used: number[]): number {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

/**
 * Decide the next scaling action.
 *
 * Priority:
 *  1. Reclaim — if any extra lounge is empty, delete the highest-numbered one
 *     (never the base). Shrinking from the top keeps the remaining set dense.
 *  2. Grow — if every managed lounge is at/over the busy threshold and there is
 *     headroom and no active cooldown, clone a new lounge at the lowest free
 *     number.
 */
export function evaluateLounges(
  slots: LoungeSlot[],
  rules: LoungeRules,
  cooldownActive: boolean,
): LoungeAction {
  const extras = slots.filter((s) => !s.isBase);

  const emptyExtras = extras
    .filter((s) => s.count === 0)
    .sort((a, b) => b.number - a.number);
  if (emptyExtras.length > 0) {
    return { kind: "delete", channelId: emptyExtras[0]!.channelId };
  }

  const allBusy =
    slots.length > 0 && slots.every((s) => s.count >= rules.busyThreshold);
  if (allBusy && extras.length < rules.maxExtras && !cooldownActive) {
    return {
      kind: "create",
      number: nextFreeNumber(extras.map((e) => e.number)),
    };
  }

  return { kind: "none" };
}
