import {
  defineModule,
  type ModuleDefinition,
} from "@lumi/module-kit";
import { confessCommand } from "./commands/confess.js";
import { confessionsCommand } from "./commands/confessions.js";
import { ConfigSchema, ModuleName } from "./config.js";
import { eraseUserHashData, readUserHashStatus } from "./data.js";
import { interactionListener } from "./listeners/interactions.js";

const confessionsModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Confessions",
  emoji: "🕊️",
  description:
    "Anonymous confessions with numbered cards, optional threads, anonymous replies, cooldowns, and hash-based moderator bans.",
  version: "2.0.0",
  config: ConfigSchema,
  dataLifecycle: {
    async exportUserData(services, guildId, userId) {
      const status = await readUserHashStatus(services, guildId, userId);
      if (!status) return null;
      return {
        banned: status.banned,
        cooldownActive: status.cooldown,
        note: "Confessions are stored against message IDs. Author hashes are irreversible and cannot be used to list authored confessions.",
      };
    },
    async deleteUserData(services, guildId, userId) {
      const result = await eraseUserHashData(services, guildId, userId);
      return {
        deleted: result.deleted,
        notes: [
          ...(result.cooldownCleared
            ? ["Cleared the active confession cooldown for this server."]
            : []),
          "Confession records are tied to message IDs and irreversible hashes. They cannot be located from a user ID and are not deleted by this request.",
        ],
      };
    },
  },
  commands: [confessCommand, confessionsCommand],
  listeners: [interactionListener],
  tasks: [],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default confessionsModule;
