import { ActivityType } from "discord.js";

export interface PresenceActivity {
  name: string;
  type: ActivityType;
  state: string | null;
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
  const roles = new Set<string>();
  for (const activity of activities) {
    const typeStr = ACTIVITY_TYPE_NAMES[activity.type];
    if (!typeStr) continue;
    const matchable = [activity.name, activity.state]
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toLowerCase());
    for (const mapping of mappings) {
      if (mapping.type.toLowerCase() === typeStr.toLowerCase()) {
        const target = mapping.match.toLowerCase();
        if (matchable.some((s) => s.includes(target))) {
          roles.add(mapping.roleId);
        }
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
): RoleDiff {
  const want = new Set(desired);
  const has = new Set(current);
  const owned = new Set(granted);
  const add = [...want].filter((r) => !has.has(r));
  const added = new Set(add);
  const remove = [...owned].filter((r) => !want.has(r) && has.has(r));
  const next = [
    ...new Set(
      [...owned]
        .filter((r) => added.has(r) || (has.has(r) && want.has(r)))
        .concat(add),
    ),
  ];
  return { add, remove, granted: next };
}
