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
  type RoleDiff,
} from "./Matcher.js";

export interface ConvergeOutcome {
  diff: RoleDiff;
  sawPresence: boolean;
}

export async function convergeMember(
  services: Container,
  guildId: string,
  userId: string,
  snapshot: { activities: PresenceActivity[] | null; roles: string[] },
): Promise<ConvergeOutcome | null> {
  const state = await getMemberState(services, guildId, userId);
  if (snapshot.activities === null) return null;
  const activities = snapshot.activities;

  const mappings = await getMappings(services, guildId);
  const desired = matchActivities(activities, mappings);
  const managedRoles = mappings.map((m) => m.roleId);
  const diff = planRoleDiff(desired, snapshot.roles, state?.granted ?? [], managedRoles);

  const guild = services.client.guilds.cache.get(guildId);
  if (!guild) return null;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;
  for (const roleId of diff.remove) {
    await member.roles.remove(roleId);
  }
  for (const roleId of diff.add) {
    await member.roles.add(roleId);
  }

  if (diff.granted.length === 0 && desired.length === 0) {
    if (state) await clearMemberState(services, guildId, userId);
    return { diff, sawPresence: true };
  }

  await setMemberState(services, guildId, userId, {
    activities,
    granted: diff.granted,
  });
  return { diff, sawPresence: true };
}

export function activitiesFromPresence(
  presence: Presence,
): PresenceActivity[] {
  return presence.activities.map((a) => ({
    name: a.name,
    type: a.type,
    state: a.state,
    details: a.details,
  }));
}

export function rolesFromMember(member: GuildMember): string[] {
  return [...member.roles.cache.keys()];
}