import { Duration } from "@sapphire/duration";

const DURATION_PATTERN = /^(?:\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w)\s*)+$/i;

export function parseDurationMs(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const num = Number(text);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  if (!DURATION_PATTERN.test(text)) return null;
  const offset = new Duration(text).offset;
  if (!Number.isFinite(offset) || offset <= 0) return null;
  return offset;
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return `${ms}ms`;
  if (ms < 1_000) return `${ms}ms`;
  const parts: string[] = [];
  const units: [string, number][] = [
    ["w", 604_800_000],
    ["d", 86_400_000],
    ["h", 3_600_000],
    ["m", 60_000],
    ["s", 1_000],
  ];
  let rest = Math.round(ms);
  for (const [label, size] of units) {
    const n = Math.floor(rest / size);
    if (n > 0) {
      parts.push(`${n}${label}`);
      rest -= n * size;
    }
  }
  return parts.join(" ") || `${ms}ms`;
}
