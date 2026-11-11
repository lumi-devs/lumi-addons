import { defineModule, type ModuleDefinition } from "@lumi/module-kit";
import { ConfigSchema } from "./config.js";
import { ModuleName } from "./constants.js";
import { messageCreateListener } from "./listeners/message-create.js";
import { threadCreateListener } from "./listeners/thread-create.js";
import { threadDeleteListener } from "./listeners/thread-delete.js";
import { cleanupTask } from "./tasks/cleanup.js";

const threadCleanerModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Thread Cleaner",
  emoji: "🧹",
  description:
    "Automatically archives or locks threads after a configurable period of inactivity.",
  version: "2.0.0",
  config: ConfigSchema,
  commands: [],
  listeners: [
    threadCreateListener,
    messageCreateListener,
    threadDeleteListener,
  ],
  tasks: [cleanupTask],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default threadCleanerModule;
