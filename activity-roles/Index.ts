import { defineModule } from "@lumi-devs/lumi/module";
import type { Container } from "@lumi-devs/lumi/services";
import { deleteAllUserData, getMappings, getMemberState, setMemberState } from "./utilities/Store.js";
import { convergeMember } from "./utilities/Converge.js";

export const activityRolesModule = defineModule({
  name: "activity-roles",
  displayName: "Activity Roles",
  emoji: "🎮",
  description:
    "Auto-assign roles based on users' Discord presence (Playing, Streaming, Listening, Watching, Custom, Competing).",
  short: "Presence-based role automation.",
  endUserDataStatement:
    "Stores each member's recent activity snapshot and the role IDs this addon granted, keyed by user ID in guild storage, to assign and revoke activity roles. Removed when the member's data is purged.",
  category: "Automation",

  onLoad(services: Container) {
    void services.client.guilds.cache.forEach((guild) => {
      void reconcileGuild(services, guild.id).catch(() => undefined);
    });
  },

  async reconcileScheduledJobs(services: Container) {
    for (const guild of services.client.guilds.cache.values()) {
      if (!(await services.db.modules.isModuleEnabled(guild.id, "activity-roles"))) continue;
      await reconcileGuild(services, guild.id).catch(() => undefined);
    }
  },

  async deleteUserData(services: Container, userId: string): Promise<void> {
    await deleteAllUserData(services, userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await services.db.guildKV.listModuleDataForTarget(
      "activity-roles",
      userId,
    );
    return rows.length > 0 ? { memberStates: rows } : null;
  },
});

async function reconcileGuild(services: Container, guildId: string) {
  const guild = services.client.guilds.cache.get(guildId);
  if (!guild) return;

  const mappings = await getMappings(services, guildId);
  if (mappings.length === 0) return;

  const managedRoles = new Set(mappings.map((m) => m.roleId));

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    const currentRoles = Array.from(member.roles.cache.keys()).filter((r) => managedRoles.has(r));
    if (currentRoles.length === 0) continue;

    const state = await getMemberState(services, guildId, member.id);
    if (!state) {
      // Initialize state for users who already have managed roles
      await setMemberState(services, guildId, member.id, {
        activities: member.presence?.activities.map((a) => ({ name: a.name, type: a.type, state: a.state })) ?? [],
        granted: currentRoles,
      });
    }

    // Run converge to fix any mismatches
    await convergeMember(services, guildId, member.id, {
      activities: member.presence?.activities.map((a) => ({ name: a.name, type: a.type, state: a.state })) ?? [],
      roles: Array.from(member.roles.cache.keys()),
    });
  }
}
