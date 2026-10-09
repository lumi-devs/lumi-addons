const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const SEGMENT_RE = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)/g;

export function parseDurationMs(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);

  let ms = 0;
  let matched = false;
  SEGMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SEGMENT_RE.exec(text)) !== null) {
    matched = true;
    ms += Number(m[1]) * UNIT_MS[m[2]!]!;
  }
  if (!matched) return null;

  SEGMENT_RE.lastIndex = 0;
  const leftover = text.replace(SEGMENT_RE, "").trim();
  if (leftover.length > 0) return null;
  return ms;
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
