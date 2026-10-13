import { defineModule } from "@lumi-devs/lumi/module";
import type { Container } from "@lumi-devs/lumi/services";
import { deleteAllUserData, getMappings } from "./utilities/Store.js";
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
  if (!(await services.db.modules.isModuleEnabled(guildId, "activity-roles"))) return;

  const mappings = await getMappings(services, guildId);
  if (mappings.length === 0) return;

  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    await convergeMember(services, guildId, member.id, {
      activities: member.presence?.activities.map((a) => ({ name: a.name, type: a.type, state: a.state })) ?? null,
      roles: Array.from(member.roles.cache.keys()),
    });
  }
}
