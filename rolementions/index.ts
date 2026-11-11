import {
  defineModule,
  type ModuleDefinition,
} from "@lumi/module-kit";
import { rolementionsCommand } from "./commands/rolementions.js";
import { ConfigSchema, ModuleName } from "./config.js";
import { messageCreateListener } from "./listeners/messageCreate.js";
import { statsPaginationListener } from "./listeners/statsPagination.js";
import { sweepTask } from "./tasks/sweep.js";

const moduleDefinition: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Role Mentions",
  emoji: "🛡️",
  description:
    "Role mention analytics with timed, automatic mention protection for sensitive roles.",
  version: "2.0.0",
  config: ConfigSchema,
  commands: [rolementionsCommand],
  listeners: [messageCreateListener, statsPaginationListener],
  tasks: [sweepTask],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default moduleDefinition;