import {
  defineModule,
  type ModuleDefinition,
} from "@lumi/module-kit";
import { z } from "zod";
import { activityRolesCommand } from "./commands/activityroles.js";
import { invalidateRuleCache, ModuleName } from "./data.js";
import { memberAddListener } from "./listeners/member-add.js";
import { memberRemoveListener } from "./listeners/member-remove.js";
import { memberUpdateListener } from "./listeners/member-update.js";
import { presenceUpdateListener } from "./listeners/presence-update.js";
import { rulesListListener } from "./listeners/rules-list.js";
import { sweepTask } from "./tasks/sweep.js";

const ConfigSchema = z.object({});

const activityRolesModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Activity Roles",
  emoji: "🎮",
  description:
    "Auto-assign roles based on users' Discord presence: Playing, Streaming, Listening, Watching, Custom, and Competing.",
  version: "2.0.0",
  config: ConfigSchema,
  dataLifecycle: {
    async exportUserData(services, guildId, userId) {
      return services.helpers.moduleData.list({
        guildId,
        moduleName: ModuleName,
        targetId: userId,
      });
    },
    async deleteUserData(services, _guildId, userId) {
      const deleted = await services.helpers.moduleData.deleteForUser(
        ModuleName,
        userId,
      );
      return { deleted };
    },
  },
  commands: [activityRolesCommand],
  listeners: [
    presenceUpdateListener,
    memberUpdateListener,
    memberAddListener,
    memberRemoveListener,
    rulesListListener,
  ],
  tasks: [sweepTask],
  async onLoad(_services) {
    invalidateRuleCache();
    return [];
  },
  async onUnload() {
    invalidateRuleCache();
  },
});

export default activityRolesModule;
