export interface LoungeSlot {
  channelId: string;
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

export function loungeName(template: string, n: number): string {
  return template.replace(/\{n\}/g, String(n));
}

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

export function nextFreeNumber(used: number[]): number {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

export function shouldDeleteChild(occupancy: number): boolean {
  return occupancy === 0;
}

export function canCreateChild(
  currentCount: number,
  maxExtras: number,
  cooldownActive: boolean,
): boolean {
  return currentCount < maxExtras && !cooldownActive;
}

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
