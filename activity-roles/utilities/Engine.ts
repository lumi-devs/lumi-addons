import type { Container } from "@lumi-devs/lumi/services";
import type { Guild, GuildMember } from "discord.js";
import {
  clearMemberState,
  getMappings,
  getMemberState,
  setMemberState,
  type MemberState,
} from "./Store.js";
import {
  matchActivities,
  planRoleDiff,
  type PresenceActivity,
  type RoleDiff,
} from "./Matcher.js";

export type ConvergeResult =
  | "granted"
  | "revoked"
  | "holding"
  | "not-holding"
  | "unconfigured";

export interface ConvergeOutcome {
  result: ConvergeResult;
  diff: RoleDiff;
}

export async function converge(
  services: Container,
  input: {
    guild: Guild;
    member: GuildMember;
    activities: PresenceActivity[] | null;
  },
): Promise<ConvergeOutcome | null> {
  const { guild, member } = input;
  const guildId = guild.id;
  const userId = member.id;
  if (member.user.bot) return null;

  const mappings = await getMappings(services, guildId);
  if (mappings.length === 0) return { result: "unconfigured", diff: { add: [], remove: [], granted: [] } };

  const stored: MemberState | null = await getMemberState(services, guildId, userId);
  if (input.activities === null) return null;

  const desired = matchActivities(input.activities, mappings);
  const managedRoles = mappings.map((m) => m.roleId);
  const roles = [...member.roles.cache.keys()];
  const diff = planRoleDiff(desired, roles, stored?.granted ?? [], managedRoles);

  if (diff.add.length === 0 && diff.remove.length === 0) {
    const before = JSON.stringify([...(stored?.granted ?? [])].sort());
    const after = JSON.stringify([...diff.granted].sort());
    if (stored && before !== after) {
      await setMemberState(services, guildId, userId, { granted: diff.granted });
    }
    return { result: diff.granted.length > 0 ? "holding" : "not-holding", diff };
  }

  const settled = await Promise.allSettled([
    ...diff.remove.map((roleId) => member.roles.remove(roleId, "Activity role no longer matches presence")),
    ...diff.add.map((roleId) => member.roles.add(roleId, "Activity role matches presence")),
  ]);
  const failed = settled.filter((s) => s.status === "rejected");
  if (failed.length > 0) {
    services.logger.warn(`[ActivityRoles] ${failed.length} role edits failed for ${userId} in ${guildId}`);
  }

  if (diff.granted.length === 0 && desired.length === 0) {
    if (stored) await clearMemberState(services, guildId, userId);
    return { result: diff.remove.length > 0 ? "revoked" : "not-holding", diff };
  }

  await setMemberState(services, guildId, userId, { granted: diff.granted });
  return { result: diff.add.length > 0 ? "granted" : "revoked", diff };
}

export function activitiesFromPresence(
  presence: { activities: ArrayLike<{ name: string; type: number; state: string | null; details: string | null }> },
): PresenceActivity[] {
  return Array.from(presence.activities, (a) => ({
    name: a.name,
    type: a.type as PresenceActivity["type"],
    state: a.state,
    details: a.details,
  }));
}
