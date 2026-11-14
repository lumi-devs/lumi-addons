import { describe, it, expect } from "bun:test";
import {
  normalizeActivityType,
  activityTypeName,
  activitiesFromPresence,
  matchingRules,
  matchRuleRoles,
  type ActivitySnapshot,
  type ActivityRule,
} from "../logic.js";
import { ActivityType, type Presence } from "discord.js";

describe("normalizeActivityType", () => {
  it("normalizes matching string representations", () => {
    expect(normalizeActivityType("playing")).toBe("Playing");
    expect(normalizeActivityType("PLAYING")).toBe("Playing");
    expect(normalizeActivityType("Streaming")).toBe("Streaming");
    expect(normalizeActivityType("listening")).toBe("Listening");
    expect(normalizeActivityType("watching")).toBe("Watching");
    expect(normalizeActivityType("custom")).toBe("Custom");
    expect(normalizeActivityType("competing")).toBe("Competing");
  });

  it("returns null for unrecognized strings", () => {
    expect(normalizeActivityType("unknown")).toBeNull();
    expect(normalizeActivityType("")).toBeNull();
  });
});

describe("activityTypeName", () => {
  it("maps Discord ActivityType enum to string names", () => {
    expect(activityTypeName(ActivityType.Playing)).toBe("Playing");
    expect(activityTypeName(ActivityType.Streaming)).toBe("Streaming");
    expect(activityTypeName(ActivityType.Listening)).toBe("Listening");
    expect(activityTypeName(ActivityType.Watching)).toBe("Watching");
    expect(activityTypeName(ActivityType.Custom)).toBe("Custom");
    expect(activityTypeName(ActivityType.Competing)).toBe("Competing");
  });

  it("returns null for unknown enum values", () => {
    expect(activityTypeName(999 as unknown as ActivityType)).toBeNull();
  });
});

describe("activitiesFromPresence", () => {
  it("extracts activities from presence", () => {
    const presence = {
      activities: [
        { name: "Minecraft", type: ActivityType.Playing, state: "Survival", details: "Singleplayer" },
        { name: "Spotify", type: ActivityType.Listening, state: "Liked Songs", details: "Various Artists" },
      ],
    } as unknown as Presence;

    const activities = activitiesFromPresence(presence);
    expect(activities).toHaveLength(2);
    expect(activities[0]).toEqual({
      name: "Minecraft",
      type: ActivityType.Playing,
      state: "Survival",
      details: "Singleplayer",
    });
    expect(activities[1]).toEqual({
      name: "Spotify",
      type: ActivityType.Listening,
      state: "Liked Songs",
      details: "Various Artists",
    });
  });

  it("handles activities with null state/details", () => {
    const presence = {
      activities: [
        { name: "Game", type: ActivityType.Playing, state: null, details: null },
      ],
    } as unknown as Presence;

    const activities = activitiesFromPresence(presence);
    expect(activities[0]?.state).toBeNull();
    expect(activities[0]?.details).toBeNull();
  });

  it("returns empty array for empty activities", () => {
    const presence = {
      activities: [],
    } as unknown as Presence;

    expect(activitiesFromPresence(presence)).toEqual([]);
  });
});

describe("matchingRules", () => {
  const rules: ActivityRule[] = [
    { type: "Playing", match: "minecraft", roleId: "role-1" },
    { type: "Playing", match: "valorant", roleId: "role-2" },
    { type: "Listening", match: "spotify", roleId: "role-3" },
    { type: "Custom", match: "discord.gg", roleId: "role-4" },
    { type: "Watching", match: "youtube", roleId: "role-5" },
  ];

  it("matches Playing activity by name", () => {
    const activities: ActivitySnapshot[] = [
      { name: "Minecraft", type: ActivityType.Playing, state: null, details: null },
    ];
    const matched = matchingRules(activities, rules);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.roleId).toBe("role-1");
  });

  it("matches case-insensitively", () => {
    const activities: ActivitySnapshot[] = [
      { name: "MINECRAFT", type: ActivityType.Playing, state: null, details: null },
    ];
    const matched = matchingRules(activities, rules);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.roleId).toBe("role-1");
  });

  it("matches substring in name", () => {
    const activities: ActivitySnapshot[] = [
      { name: "Playing Minecraft Java Edition", type: ActivityType.Playing, state: null, details: null },
    ];
    const matched = matchingRules(activities, rules);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.roleId).toBe("role-1");
  });

  it("matches Listening activity by name", () => {
    const activities: ActivitySnapshot[] = [
      { name: "Spotify", type: ActivityType.Listening, state: "Liked Songs", details: null },
    ];
    const matched = matchingRules(activities, rules);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.roleId).toBe("role-3");
  });

  it("matches Custom activity by state", () => {
    const activities: ActivitySnapshot[] = [
      { name: "Custom Status", type: ActivityType.Custom, state: "discord.gg/myserver", details: null },
    ];
    const matched = matchingRules(activities, rules);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.roleId).toBe("role-4");
  });

  it("matches Custom activity by details", () => {
    const activities: ActivitySnapshot[] = [
      { name: "Custom Status", type: ActivityType.Custom, state: null, details: "discord.gg/myserver" },
    ];
    const matched = matchingRules(activities, rules);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.roleId).toBe("role-4");
  });

  it("returns unique role IDs via matchRuleRoles", () => {
    const activities: ActivitySnapshot[] = [
      { name: "Minecraft", type: ActivityType.Playing, state: null, details: null },
      { name: "Spotify", type: ActivityType.Listening, state: null, details: null },
    ];
    const duplicateRules: ActivityRule[] = [
      { type: "Playing", match: "minecraft", roleId: "role-1" },
      { type: "Playing", match: "craft", roleId: "role-1" },
      { type: "Listening", match: "spotify", roleId: "role-2" },
    ];
    const roleIds = matchRuleRoles(activities, duplicateRules);
    expect(roleIds).toEqual(["role-1", "role-2"]);
  });
});
