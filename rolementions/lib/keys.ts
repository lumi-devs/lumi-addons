export const MODULE_NAME = "rolementions";

export function dayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export const COUNT_KEY = "count";
export const PROTECTED_KEY = "protected";
export const BLOCK_KEY = "block";

export const EXPIRE_TASK = "rolementions:expire";

export const countTarget = (day: string, roleId: string): string =>
  `${day}:${roleId}`;
