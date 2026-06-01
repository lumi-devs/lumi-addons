export const MODULE_NAME = "rolementions";

const BASE = "ember:rolementions";

/** UTC day stamp (YYYY-MM-DD) — mention counters roll over (reset) at UTC midnight. */
export function dayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export const RmKeys = {
  /** HASH roleId -> mention count for the given UTC day. */
  count: (guildId: string, day = dayStamp()) =>
    `${BASE}:count:${guildId}:${day}`,
  /** HASH roleId -> serialized {@link ActiveBlock}. */
  blocks: (guildId: string) => `${BASE}:blocks:${guildId}`,
  /** STRING — the managed AutoMod rule id for this guild. */
  ruleId: (guildId: string) => `${BASE}:rule:${guildId}`,
} as const;

/** Counter TTL: long enough to keep "today" alive past UTC midnight, then auto-expire. */
export const COUNT_TTL_SECONDS = 36 * 60 * 60;

/** ModuleData key under which a protected-role entry is stored (targetId = roleId). */
export const PROTECTED_KEY = "protected";
