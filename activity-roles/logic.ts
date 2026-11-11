import { ActivityType, type Presence } from "discord.js";

export const ActivityTypeNames = [
  "Playing",
  "Streaming",
  "Listening",
  "Watching",
  "Custom",
  "Competing",
] as const;

export type ActivityTypeName = (typeof ActivityTypeNames)[number];

export interface ActivitySnapshot {
  name: string;
  type: ActivityType;
  state: string | null;
  details: string | null;
}

export interface ActivityRule {
  type: ActivityTypeName;
  match: string;
  roleId: string;
}

const ActivityTypeLabels: Partial<Record<ActivityType, ActivityTypeName>> = {
  [ActivityType.Playing]: "Playing",
  [ActivityType.Streaming]: "Streaming",
  [ActivityType.Listening]: "Listening",
  [ActivityType.Watching]: "Watching",
  [ActivityType.Custom]: "Custom",
  [ActivityType.Competing]: "Competing",
};

export function normalizeActivityType(value: string): ActivityTypeName | null {
  const normalized = value.trim().toLowerCase();
  return (
    ActivityTypeNames.find((name) => name.toLowerCase() === normalized) ?? null
  );
}

export function activityTypeName(type: ActivityType): ActivityTypeName | null {
  return ActivityTypeLabels[type] ?? null;
}

export function activitiesFromPresence(presence: Presence): ActivitySnapshot[] {
  return Array.from(presence.activities, (activity) => ({
    name: activity.name,
    type: activity.type,
    state: activity.state,
    details: activity.details,
  }));
}

export function matchingRules(
  activities: readonly ActivitySnapshot[],
  rules: readonly ActivityRule[],
): ActivityRule[] {
  const prepared = rules
    .map((rule) => ({
      rule,
      type: rule.type.toLowerCase(),
      target: rule.match.trim().toLowerCase(),
    }))
    .filter((entry) => entry.target.length > 0);
  const matched = new Map<string, ActivityRule>();
  for (const activity of activities) {
    const type = activityTypeName(activity.type);
    if (!type) continue;
    const loweredType = type.toLowerCase();
    const candidates =
      type === "Custom"
        ? [activity.state, activity.details]
        : [activity.name, activity.state, activity.details];
    const haystacks = candidates
      .filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      )
      .map((value) => value.toLowerCase());
    for (const entry of prepared) {
      if (entry.type !== loweredType) continue;
      if (!haystacks.some((haystack) => haystack.includes(entry.target))) {
        continue;
      }
      matched.set(
        `${entry.rule.type}:${entry.rule.match}:${entry.rule.roleId}`,
        entry.rule,
      );
    }
  }
  return [...matched.values()];
}

export function matchRuleRoles(
  activities: readonly ActivitySnapshot[],
  rules: readonly ActivityRule[],
): string[] {
  return [
    ...new Set(matchingRules(activities, rules).map((rule) => rule.roleId)),
  ];
}
