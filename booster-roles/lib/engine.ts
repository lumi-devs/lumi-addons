// Pure, side-effect-free helpers for booster roles: name validation and colour
// parsing/formatting. Kept dependency-free so they're unit-testable in isolation.

export interface NameCheck {
  ok: boolean;
  /** Present when `ok` is false. */
  reason?: string;
  /** The trimmed, ready-to-use name when `ok` is true. */
  value?: string;
}

const RESERVED = new Set(["everyone", "here"]);

/**
 * Validate a proposed role name against Discord's rules plus a configurable max
 * length. Rejects empties, over-long names, `@everyone`/`@here`, and names that
 * are only whitespace/markdown noise.
 */
export function validateRoleName(raw: string, maxLength: number): NameCheck {
  const value = raw.trim();
  if (value.length === 0)
    return { ok: false, reason: "The name can't be empty." };
  if (value.length > maxLength)
    return {
      ok: false,
      reason: `The name must be ${maxLength} characters or fewer.`,
    };
  const lowered = value.replace(/^@+/, "").toLowerCase();
  if (RESERVED.has(lowered))
    return { ok: false, reason: "That name is reserved by Discord." };
  return { ok: true, value };
}

/**
 * Parse a user-supplied colour into a Discord integer. Accepts `#RRGGBB`,
 * `RRGGBB`, `0xRRGGBB`, and the shorthand `#RGB`. Returns `null` on anything
 * else so callers can surface a friendly error.
 */
export function parseHexColor(raw: string): number | null {
  let hex = raw.trim().toLowerCase();
  if (hex.startsWith("#")) hex = hex.slice(1);
  else if (hex.startsWith("0x")) hex = hex.slice(2);

  if (/^[0-9a-f]{3}$/.test(hex))
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;

  return Number.parseInt(hex, 16);
}

/** Format a Discord integer colour as an uppercase `#RRGGBB` string. */
export function colorToHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
}
