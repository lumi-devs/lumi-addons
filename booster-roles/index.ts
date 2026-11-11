import {
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import type { Interaction } from "discord.js";
import boosterRoleAdminCommand from "./commands/boosterrole-admin.js";
import boosterRoleCommand from "./commands/boosterrole.js";
import {
  ConfigSchema,
  getConfig,
  ModuleName,
  moduleNameOf,
} from "./config.js";
import { getRoleById, getUserRoleIndex, type RoleRecord } from "./data.js";
import { IdPrefix } from "./ids.js";
import { handleBoosterRoleInteraction } from "./interactions.js";
import memberUpdateListener from "./listeners/member-update.js";
import { purgeUserRoles } from "./roles.js";
import { sweepTask } from "./tasks/sweep.js";

const interactionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (
      !interaction.isButton() &&
      !interaction.isAnySelectMenu() &&
      !interaction.isModalSubmit()
    ) {
      return;
    }
    if (!interaction.customId.startsWith(IdPrefix)) return;
    await handleBoosterRoleInteraction(interaction, services);
  },
};

const boosterRolesModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Booster Roles",
  emoji: "🎨",
  description:
    "Personal custom roles for server boosters with sharing, moderation, and grace-period cleanup",
  version: "2.0.0",
  config: ConfigSchema,
  dataLifecycle: {
    async exportUserData(services, guildId, userId) {
      const entries = await services.helpers.moduleData.list({
        guildId,
        moduleName: moduleNameOf(services),
        targetId: userId,
      });
      const index = await getUserRoleIndex(services, guildId, userId);
      const roleIds = [...new Set([...index.owned, ...index.shared])];
      const roles: RoleRecord[] = [];
      for (const roleId of roleIds) {
        const record = await getRoleById(services, guildId, roleId);
        if (record) roles.push(record);
      }
      return { entries, roles };
    },
    async deleteUserData(services, guildId, userId) {
      const entries = await services.helpers.moduleData.list({
        moduleName: moduleNameOf(services),
        targetId: userId,
        limit: 5_000,
      });
      const guildIds = new Set<string>([guildId]);
      for (const entry of entries) guildIds.add(entry.guildId);

      let roles = 0;
      let shares = 0;
      for (const targetGuildId of guildIds) {
        const config = await getConfig(services, targetGuildId);
        const result = await purgeUserRoles(
          services,
          targetGuildId,
          userId,
          config,
        );
        roles += result.roles;
        shares += result.shares;
      }

      const records = await services.helpers.moduleData.deleteForUser(
        moduleNameOf(services),
        userId,
      );
      return {
        deleted: roles + shares + records,
        notes: [
          `Deleted ${roles} owned role(s)`,
          `Removed ${shares} shared role assignment(s)`,
          `Deleted ${records} remaining data record(s)`,
        ],
      };
    },
  },
  commands: [boosterRoleCommand, boosterRoleAdminCommand],
  listeners: [memberUpdateListener, interactionListener],
  tasks: [sweepTask],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default boosterRolesModule;
