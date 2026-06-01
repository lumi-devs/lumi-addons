import type { Guild } from "discord.js";

/**
 * Parse a duration string into whole minutes.
 * Accepts bare numbers ("60" = 60 minutes), or unit suffixes: "90m", "2h", "1d".
 * Returns null when unparseable or non-positive.
 */
export function parseMinutes(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  const match = /^(\d+)\s*(m|min|h|hr|hour|d|day)?s?$/.exec(trimmed);
  if (!match) return null;
  const value = parseInt(match[1]!, 10);
  if (Number.isNaN(value) || value <= 0) return null;
  switch (match[2]) {
    case "h":
    case "hr":
    case "hour":
      return value * 60;
    case "d":
    case "day":
      return value * 60 * 24;
    default:
      return value; // minutes
  }
}

/** Compact human duration from a minute count, e.g. 150 → "2h 30m". */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  return parts.join(" ");
}

/** Human remaining time until an epoch-ms timestamp. */
export function formatRemaining(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "expired";
  return formatMinutes(Math.ceil(ms / 60_000));
}

/**
 * Safe role label that never pings: "Name (`id`)".
 * Falls back to "Unknown Role" for deleted roles, optionally using a cached name.
 */
export function roleLabel(
  guild: Guild,
  roleId: string,
  fallbackName?: string,
): string {
  const role = guild.roles.cache.get(roleId);
  const name = role?.name ?? fallbackName ?? "Unknown Role";
  return `**${name}** (\`${roleId}\`)`;
}
