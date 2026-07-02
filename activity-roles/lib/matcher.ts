import { ActivityType, type Activity } from "discord.js";
import type { ActivityRoleMapping } from "./store.js";

function activityTypeToString(type: ActivityType): string {
  switch (type) {
    case ActivityType.Playing:
      return "Playing";
    case ActivityType.Streaming:
      return "Streaming";
    case ActivityType.Listening:
      return "Listening";
    case ActivityType.Watching:
      return "Watching";
    case ActivityType.Custom:
      return "Custom";
    case ActivityType.Competing:
      return "Competing";
    default:
      return "Unknown";
  }
}

export function matchActivities(
  activities: Activity[],
  mappings: ActivityRoleMapping[],
): string[] {
  const rolesToAssign = new Set<string>();

  for (const activity of activities) {
    const typeStr = activityTypeToString(activity.type);

    // For custom statuses, the string to match is usually the state.
    // For others, it's the name (e.g., "League of Legends") or state ("In Game").
    const matchableStrings = [activity.name, activity.state, activity.details]
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toLowerCase());

    for (const mapping of mappings) {
      if (mapping.type.toLowerCase() === typeStr.toLowerCase()) {
        const targetMatch = mapping.match.toLowerCase();

        // Check if any part of the activity matches the configured string (partial match)
        if (matchableStrings.some((s) => s.includes(targetMatch))) {
          rolesToAssign.add(mapping.roleId);
        }
      }
    }
  }

  return Array.from(rolesToAssign);
}
