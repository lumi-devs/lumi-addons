import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import { defineListener } from "@lumi-devs/lumi/listeners";
import type { Container } from "@lumi-devs/lumi/services";
import { MODULE_NAME, getMappings } from "../utilities/Store.js";
import { converge } from "../utilities/Engine.js";
import type { PresenceActivity } from "../utilities/Matcher.js";

export const memberUpdateListener = defineListener({
  name: "activityRolesMemberUpdate",
  event: Events.GuildMemberUpdate,
  module: MODULE_NAME,
  guildId: (_old: GuildMember | PartialGuildMember, member: GuildMember) =>
    member.guild.id,
  async execute(
    services: Container,
    oldMember: GuildMember | PartialGuildMember,
    member: GuildMember,
  ): Promise<void> {
    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(member.roles.cache.keys());
    let touched = false;
    for (const id of oldRoles) {
      if (!newRoles.has(id)) {
        touched = true;
        break;
      }
    }
    if (!touched) {
      for (const id of newRoles) {
        if (!oldRoles.has(id)) {
          touched = true;
          break;
        }
      }
    }
    if (!touched) return;
    const mappings = await getMappings(services, member.guild.id);
    if (mappings.length === 0) return;
    const managed = new Set(mappings.map((m) => m.roleId));
    let managedTouched = false;
    for (const id of oldRoles) {
      if (!newRoles.has(id) && managed.has(id)) {
        managedTouched = true;
        break;
      }
    }
    if (!managedTouched) {
      for (const id of newRoles) {
        if (!oldRoles.has(id) && managed.has(id)) {
          managedTouched = true;
          break;
        }
      }
    }
    if (!managedTouched) return;
    const presence = member.presence;
    if (!presence) return;
    const activities: PresenceActivity[] = presence.activities.map((a) => ({
      name: a.name,
      type: a.type,
      state: a.state,
      details: a.details,
    }));
    await converge(services, { guild: member.guild, member, activities }).catch(
      (err: unknown) =>
        services.logger.error(
          `[ActivityRoles] Failed to reconcile roles for ${member.id}: ${err instanceof Error ? err.message : String(err)}`,
        ),
    );
  },
});

export default memberUpdateListener;
