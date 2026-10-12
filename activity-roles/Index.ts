import { defineModule } from "@lumi-devs/lumi/lib/module-system/Module.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { deleteAllUserData } from "./utilities/Store.js";

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
