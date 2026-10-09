import { describe, expect, it } from "vitest";
import {
  matchActivities,
  planRoleDiff,
  type PresenceActivity,
} from "./matcher.js";
import type { ActivityRoleMapping } from "./store.js";

// Discord activity type numbers: 0 Playing, 2 Listening, 3 Watching, 4 Custom.
const activity = (
  fields: Partial<PresenceActivity> & { name?: string },
): PresenceActivity => ({
  name: "",
  type: 0,
  state: null,
  ...fields,
});

const mapping = (
  type: string,
  match: string,
  roleId: string,
): ActivityRoleMapping => ({ id: `${type}:${match}`, type, match, roleId });

describe("matchActivities", () => {
  it("matches on the activity name, case-insensitively", () => {
    const activities = [activity({ type: 0, name: "League of Legends" })];
    const mappings = [mapping("Playing", "league of legends", "role-1")];
    expect(matchActivities(activities, mappings)).toEqual(["role-1"]);
  });

  it("matches a partial substring within the name/state", () => {
    const activities = [
      activity({ type: 4, name: "Custom Status", state: "grinding some League" }),
    ];
    const mappings = [mapping("Custom", "league", "role-1")];
    expect(matchActivities(activities, mappings)).toEqual(["role-1"]);
  });

  it("requires the activity type to match the mapping type", () => {
    const activities = [activity({ type: 3, name: "League of Legends" })];
    const mappings = [mapping("Playing", "league of legends", "role-1")];
    expect(matchActivities(activities, mappings)).toEqual([]);
  });

  it("returns no roles when nothing matches", () => {
    const activities = [activity({ type: 0, name: "Solitaire" })];
    const mappings = [mapping("Playing", "league of legends", "role-1")];
    expect(matchActivities(activities, mappings)).toEqual([]);
  });

  it("de-duplicates roles awarded by multiple matching activities", () => {
    const activities = [
      activity({ type: 0, name: "League of Legends" }),
      activity({
        type: 4,
        name: "Custom Status",
        state: "playing league rn",
      }),
    ];
    const mappings = [
      mapping("Playing", "league of legends", "role-1"),
      mapping("Custom", "league", "role-1"),
    ];
    expect(matchActivities(activities, mappings)).toEqual(["role-1"]);
  });

  it("collects roles from multiple distinct mappings", () => {
    const activities = [
      activity({ type: 0, name: "League of Legends" }),
      activity({ type: 2, name: "Spotify" }),
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
      matchActivities([activity({ type: 0, name: "x" })], []),
    ).toEqual([]);
  });
});

describe("planRoleDiff", () => {
  it("adds desired roles the member lacks and takes ownership", () => {
    expect(planRoleDiff(["role-1"], [], [])).toEqual({
      add: ["role-1"],
      remove: [],
      granted: ["role-1"],
    });
  });

  it("does not re-add roles the member already holds", () => {
    expect(planRoleDiff(["role-1"], ["role-1"], [])).toEqual({
      add: [],
      remove: [],
      granted: [],
    });
  });

  it("removes only owned roles that are no longer desired", () => {
    expect(planRoleDiff([], ["role-1", "role-2"], ["role-1"])).toEqual({
      add: [],
      remove: ["role-1"],
      granted: [],
    });
  });

  it("never strips a managed role the addon did not grant", () => {
    expect(planRoleDiff([], ["role-1"], [])).toEqual({
      add: [],
      remove: [],
      granted: [],
    });
  });

  it("drops owned roles that vanished externally without calling remove", () => {
    expect(planRoleDiff([], [], ["role-1"])).toEqual({
      add: [],
      remove: [],
      granted: [],
    });
  });

  it("keeps owned roles that are still desired and held", () => {
    expect(planRoleDiff(["role-1"], ["role-1"], ["role-1"])).toEqual({
      add: [],
      remove: [],
      granted: ["role-1"],
    });
  });

  it("re-adds owned roles lost externally and keeps ownership", () => {
    expect(planRoleDiff(["role-1"], [], ["role-1"])).toEqual({
      add: ["role-1"],
      remove: [],
      granted: ["role-1"],
    });
  });
});
