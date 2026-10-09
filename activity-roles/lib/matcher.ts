import type { ActivityRoleMapping } from "./store.js";

/** Relayed presence activity. `type` is the Discord activity number (0 Playing, 1 Streaming, 2 Listening, 3 Watching, 4 Custom, 5 Competing). */
export interface PresenceActivity {
  name: string;
  type: number;
  state: string | null;
}

const ACTIVITY_TYPE_NAMES: Record<number, string> = {
  0: "Playing",
  1: "Streaming",
  2: "Listening",
  3: "Watching",
  4: "Custom",
  5: "Competing",
};

export const VALID_ACTIVITY_TYPES = [
  "Playing",
  "Streaming",
  "Listening",
  "Watching",
  "Custom",
  "Competing",
];

export function matchActivities(
  activities: PresenceActivity[],
  mappings: ActivityRoleMapping[],
): string[] {
  const rolesToAssign = new Set<string>();

  for (const activity of activities) {
    const typeStr = ACTIVITY_TYPE_NAMES[activity.type] ?? "Unknown";

    const matchableStrings = [activity.name, activity.state]
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toLowerCase());

    for (const mapping of mappings) {
      if (mapping.type.toLowerCase() === typeStr.toLowerCase()) {
        const targetMatch = mapping.match.toLowerCase();
        if (matchableStrings.some((s) => s.includes(targetMatch))) {
          rolesToAssign.add(mapping.roleId);
        }
      }
    }
  }

  return Array.from(rolesToAssign);
}

export interface RoleDiff {
  add: string[];
  remove: string[];
  granted: string[];
}

/** Diff desired roles against live roles, touching only roles this addon owns. */
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
