import {
  defineModule,
  type ModuleDefinition,
} from "@lumi/module-kit";
import { dragmeCommand } from "./commands/dragme.js";
import { ConfigSchema } from "./config.js";
import { type DragRequest, ModuleName, PendingKey } from "./data.js";
import { interactionsListener } from "./listeners/interactions.js";
import { expireSweepTask } from "./tasks/sweep.js";

const dragmeModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Drag Me",
  emoji: "🫳",
  description:
    "Voice drag requests: ask the people in a voice channel to pull you in, with one-click accept and decline.",
  version: "2.0.0",
  config: ConfigSchema,
  dataLifecycle: {
    async exportUserData(services, guildId, userId) {
      const entries = await services.helpers.moduleData.list<DragRequest>({
        guildId,
        moduleName: ModuleName,
        key: PendingKey,
      });
      return entries.filter(
        (entry) =>
          entry.targetId === userId ||
          entry.value?.targetUserId === userId,
      );
    },
    async deleteUserData(services, guildId, userId) {
      const entries = await services.helpers.moduleData.list<DragRequest>({
        guildId,
        moduleName: ModuleName,
        key: PendingKey,
      });
      let deleted = 0;
      for (const entry of entries) {
        if (
          entry.targetId === userId ||
          entry.value?.targetUserId === userId
        ) {
          deleted += await services.helpers.moduleData.delete(
            guildId,
            ModuleName,
            entry.targetId,
            PendingKey,
          );
        }
      }
      deleted += await services.helpers.moduleData.deleteForUser(
        ModuleName,
        userId,
      );
      return { deleted };
    },
  },
  commands: [dragmeCommand],
  listeners: [interactionsListener],
  tasks: [expireSweepTask],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default dragmeModule;
