import { ActivityType } from "discord.js";

export interface PresenceActivity {
  name: string;
  type: ActivityType;
  state: string | null;
  details: string | null;
}

export interface ActivityRoleMapping {
  id: string;
  type: string;
  match: string;
  roleId: string;
}

export const VALID_ACTIVITY_TYPES = [
  "Playing",
  "Streaming",
  "Listening",
  "Watching",
  "Custom",
  "Competing",
] as const;

const ACTIVITY_TYPE_NAMES: Partial<Record<ActivityType, string>> = {
  [ActivityType.Playing]: "Playing",
  [ActivityType.Streaming]: "Streaming",
  [ActivityType.Listening]: "Listening",
  [ActivityType.Watching]: "Watching",
  [ActivityType.Custom]: "Custom",
  [ActivityType.Competing]: "Competing",
};

export function matchActivities(
  activities: PresenceActivity[],
  mappings: ActivityRoleMapping[],
): string[] {
  const rules = mappings.map((mapping) => ({
    roleId: mapping.roleId,
    type: mapping.type.toLowerCase(),
    target: mapping.match.toLowerCase(),
  }));
  const roles = new Set<string>();
  for (const activity of activities) {
    const type = ACTIVITY_TYPE_NAMES[activity.type]?.toLowerCase();
    if (!type) continue;
    const text = [activity.name, activity.state, activity.details]
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toLowerCase());
    for (const rule of rules) {
      if (!rule.target) continue;
      if (rule.type === type && text.some((s) => s.includes(rule.target))) {
        roles.add(rule.roleId);
      }
    }
  }
  return [...roles];
}

export interface RoleDiff {
  add: string[];
  remove: string[];
  granted: string[];
}

export function planRoleDiff(
  desired: string[],
  current: string[],
  granted: string[],
  managedRoles: string[],
): RoleDiff {
  const want = new Set(desired);
  const has = new Set(current);
  const owned = new Set(granted);
  const managed = new Set(managedRoles);
  const add = [...want].filter((r) => !has.has(r));
  const added = new Set(add);
  const remove = [...has].filter(
    (r) => (managed.has(r) || owned.has(r)) && !want.has(r),
  );
  const next = [...want].filter((r) => owned.has(r) || added.has(r));
  return { add, remove, granted: next };
}