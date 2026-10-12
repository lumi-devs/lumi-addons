import type { Container } from "@lumi-devs/lumi/services";
import type { Presence, GuildMember } from "discord.js";
import {
  clearMemberState,
  getMappings,
  getMemberState,
  setMemberState,
} from "./Store.js";
import {
  matchActivities,
  planRoleDiff,
  type PresenceActivity,
} from "./Matcher.js";

function sameActivities(
  a: PresenceActivity[],
  b: PresenceActivity[],
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && b.every((x) => a.includes(x));
}

export async function convergeMember(
  services: Container,
  guildId: string,
  userId: string,
  snapshot: { activities: PresenceActivity[] | null; roles: string[] },
): Promise<void> {
  const state = await getMemberState(services, guildId, userId);
  const activities = snapshot.activities ?? state?.activities ?? [];
  if (snapshot.activities === null && !state) return;

  const mappings = await getMappings(services, guildId);
  if (mappings.length === 0 && !state) return;

  const desired = matchActivities(activities, mappings);
  const diff = planRoleDiff(desired, snapshot.roles, state?.granted ?? []);

  try {
    const guild = services.client.guilds.cache.get(guildId);
    if (!guild) return;
    for (const roleId of diff.remove) {
      await guild.members.removeRole({ user: userId, role: roleId });
    }
    for (const roleId of diff.add) {
      await guild.members.addRole({ user: userId, role: roleId });
    }
  } catch (err) {
    services.logger.error(
      `[ActivityRoles] Failed to update roles for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (diff.granted.length === 0 && desired.length === 0) {
    if (state) await clearMemberState(services, guildId, userId);
    return;
  }
  if (
    !state ||
    !sameActivities(state.activities as PresenceActivity[], activities) ||
    !sameIds(state.granted, diff.granted)
  ) {
    await setMemberState(services, guildId, userId, {
      activities,
      granted: diff.granted,
    });
  }
}

export function activitiesFromPresence(
  presence: Presence,
): PresenceActivity[] {
  return presence.activities.map((a) => ({
    name: a.name,
    type: a.type,
    state: a.state,
  }));
}

export function rolesFromMember(member: GuildMember): string[] {
  return [...member.roles.cache.keys()];
}
