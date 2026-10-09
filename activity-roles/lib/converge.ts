import { logger } from "lumi";
import { members, modules } from "lumi/discord";
import {
  MODULE_NAME,
  clearMemberState,
  getMappings,
  getMemberState,
  setMemberState,
} from "./store.js";
import {
  matchActivities,
  planRoleDiff,
  type PresenceActivity,
} from "./matcher.js";

interface Snapshot {
  activities: PresenceActivity[] | null;
  roles: string[];
}

function sameActivities(a: PresenceActivity[], b: PresenceActivity[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && b.every((x) => a.includes(x));
}

export async function convergeMember(
  guildId: string,
  userId: string,
  snapshot: Snapshot,
): Promise<void> {
  if (!guildId || !userId) return;
  const enabled = await modules.enabled(guildId, [MODULE_NAME]);
  if (!enabled[MODULE_NAME]) return;

  const state = await getMemberState(guildId, userId);
  const activities = snapshot.activities ?? state?.activities ?? [];
  if (snapshot.activities === null && !state) return;

  const mappings = await getMappings(guildId);
  if (mappings.length === 0 && !state) return;

  const desired = matchActivities(activities, mappings);
  const diff = planRoleDiff(desired, snapshot.roles, state?.granted ?? []);

  try {
    for (const roleId of diff.remove) {
      await members.removeRole(guildId, userId, roleId);
    }
    for (const roleId of diff.add) {
      await members.addRole(guildId, userId, roleId);
    }
  } catch (error) {
    await logger.error(
      `[ActivityRoles] Failed to update roles for ${userId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (diff.granted.length === 0 && desired.length === 0) {
    if (state) await clearMemberState(guildId, userId);
    return;
  }
  if (
    !state ||
    !sameActivities(state.activities, activities) ||
    !sameIds(state.granted, diff.granted)
  ) {
    await setMemberState(guildId, userId, {
      activities,
      granted: diff.granted,
    });
  }
}

export async function handlePresenceUpdate(
  data: Record<string, unknown>,
): Promise<void> {
  const { guildId, userId, activities, roles } = data as unknown as {
    guildId: string;
    userId: string;
    activities: PresenceActivity[];
    roles: string[];
  };
  await convergeMember(guildId, userId, {
    activities: activities ?? [],
    roles: roles ?? [],
  });
}

export async function handleGuildMemberUpdate(
  data: Record<string, unknown>,
): Promise<void> {
  const { guildId, userId, newRoles } = data as unknown as {
    guildId: string;
    userId: string;
    newRoles: string[];
  };
  await convergeMember(guildId, userId, {
    activities: null,
    roles: newRoles ?? [],
  });
}
