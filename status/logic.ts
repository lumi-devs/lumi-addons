import {
  ActivityKinds,
  type ActivityKind,
  PresenceStates,
  type PresenceState,
  type RotationState,
} from "./data.js";

const MaxTextLength = 128;
const DurationPattern = /^(?:\d+[smh])+$/;

export function sanitizeStatusText(input: string): string {
  return input
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MaxTextLength);
}

export function parseActivityKind(value: string | null): ActivityKind | null {
  if (value === null) return "Playing";
  return (
    ActivityKinds.find((kind) => kind.toLowerCase() === value.toLowerCase()) ??
    null
  );
}

export function parsePresenceState(
  value: string | null,
): PresenceState | null {
  if (value === null) return "online";
  return (
    PresenceStates.find((state) => state === value.toLowerCase()) ?? null
  );
}

export function parseDurationSeconds(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!DurationPattern.test(text)) return null;

  const matches = text.match(/\d+[smh]/g);
  if (!matches) return null;

  const factors: Record<string, number> = { s: 1, m: 60, h: 3_600 };
  let total = 0;
  for (const match of matches) {
    const unit = match.at(-1);
    const amount = Number(match.slice(0, -1));
    if (!unit || !Number.isFinite(amount)) return null;
    const factor = factors[unit];
    if (factor === undefined) return null;
    total += amount * factor;
  }
  return total;
}

export function formatDurationSeconds(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "0s";
  let rest = Math.trunc(total);
  const parts: string[] = [];
  const units = [
    ["h", 3_600],
    ["m", 60],
    ["s", 1],
  ] as const;
  for (const [label, size] of units) {
    const amount = Math.floor(rest / size);
    if (amount > 0) {
      parts.push(`${amount}${label}`);
      rest -= amount * size;
    }
  }
  return parts.join(" ") || "0s";
}

export function resolvePlaceholders(
  text: string,
  stats: { guilds: number; users: number },
): string {
  return text
    .replaceAll("{guilds}", String(stats.guilds))
    .replaceAll("{users}", String(stats.users));
}

export interface ControllerCandidate {
  guildId: string;
  state: RotationState;
}

export function pickController(
  rows: readonly { guildId: string; value: RotationState }[],
): ControllerCandidate | null {
  let best: ControllerCandidate | null = null;
  for (const row of rows) {
    if (!row.value.enabled) continue;
    if (best === null || row.value.activatedAt > best.state.activatedAt) {
      best = { guildId: row.guildId, state: row.value };
    }
  }
  return best;
}