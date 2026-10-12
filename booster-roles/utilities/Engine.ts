export interface NameCheck {
  ok: boolean;
  reason?: string;
  value?: string;
}

const RESERVED = new Set(["everyone", "here"]);

export function validateRoleName(raw: string, maxLength: number): NameCheck {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, reason: "The name can't be empty." };
  if (value.length > maxLength) {
    return { ok: false, reason: `The name must be ${maxLength} characters or fewer.` };
  }
  const lowered = value.replace(/^@+/, "").toLowerCase();
  if (RESERVED.has(lowered)) return { ok: false, reason: "That name is reserved by Discord." };
  return { ok: true, value };
}

export function parseHexColor(raw: string): number | null {
  let hex = raw.trim().toLowerCase();
  if (hex.startsWith("#")) hex = hex.slice(1);
  else if (hex.startsWith("0x")) hex = hex.slice(2);

  if (/^[0-9a-f]{3}$/.test(hex)) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;

  return Number.parseInt(hex, 16);
}

export function colorToHex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
}

export function isBoosterEligible(
  roles: string[],
  premiumSince: number | null,
  boosterRoleIds: string[],
): boolean {
  if (premiumSince !== null) return true;
  if (boosterRoleIds.length === 0) return false;
  return boosterRoleIds.some((id) => roles.includes(id));
}
