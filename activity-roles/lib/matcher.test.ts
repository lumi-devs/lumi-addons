import { describe, it, expect } from "vitest";
import { ActivityType, type Activity } from "discord.js";
import { matchActivities } from "./matcher.js";
import type { ActivityRoleMapping } from "./store.js";

const activity = (fields: Partial<Activity>): Activity =>
  fields as unknown as Activity;

const mapping = (
  type: string,
  match: string,
  roleId: string,
): ActivityRoleMapping => ({ id: `${type}:${match}`, type, match, roleId });

describe("matchActivities", () => {
  it("matches on the activity name, case-insensitively", () => {
    const activities = [
      activity({ type: ActivityType.Playing, name: "League of Legends" }),
    ];
    const mappings = [mapping("Playing", "league of legends", "role-1")];
    expect(matchActivities(activities, mappings)).toEqual(["role-1"]);
  });

  it("matches a partial substring within the name/state/details", () => {
    const activities = [
      activity({ type: ActivityType.Custom, state: "grinding some League" }),
    ];
    const mappings = [mapping("Custom", "league", "role-1")];
    expect(matchActivities(activities, mappings)).toEqual(["role-1"]);
  });

  it("requires the activity type to match the mapping type", () => {
    const activities = [
      activity({ type: ActivityType.Watching, name: "League of Legends" }),
    ];
    const mappings = [mapping("Playing", "league of legends", "role-1")];
    expect(matchActivities(activities, mappings)).toEqual([]);
  });

  it("returns no roles when nothing matches", () => {
    const activities = [
      activity({ type: ActivityType.Playing, name: "Solitaire" }),
    ];
    const mappings = [mapping("Playing", "league of legends", "role-1")];
    expect(matchActivities(activities, mappings)).toEqual([]);
  });

  it("de-duplicates roles awarded by multiple matching activities", () => {
    const activities = [
      activity({ type: ActivityType.Playing, name: "League of Legends" }),
      activity({ type: ActivityType.Custom, state: "playing league rn" }),
    ];
    const mappings = [
      mapping("Playing", "league of legends", "role-1"),
      mapping("Custom", "league", "role-1"),
    ];
    expect(matchActivities(activities, mappings)).toEqual(["role-1"]);
  });

  it("collects roles from multiple distinct mappings", () => {
    const activities = [
      activity({ type: ActivityType.Playing, name: "League of Legends" }),
      activity({ type: ActivityType.Listening, name: "Spotify", details: "Some Song" }),
    ];
    const mappings = [
      mapping("Playing", "league of legends", "role-1"),
      mapping("Listening", "spotify", "role-2"),
    ];
    expect(matchActivities(activities, mappings).sort()).toEqual([
      "role-1",
      "role-2",
    ]);
  });

  it("returns an empty array for no activities or no mappings", () => {
    expect(matchActivities([], [mapping("Playing", "x", "role-1")])).toEqual(
      [],
    );
    expect(
      matchActivities(
        [activity({ type: ActivityType.Playing, name: "x" })],
        [],
      ),
    ).toEqual([]);
  });
});
