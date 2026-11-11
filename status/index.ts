import {
  defineModule,
  type ModuleDefinition,
} from "@lumi/module-kit";
import { z } from "zod";
import { statusCommand } from "./commands/status.js";
import { ModuleName } from "./data.js";
import { interactionsListener } from "./listeners/interactions.js";
import { rotateTask } from "./tasks/rotate.js";

const ConfigSchema = z.object({});

const statusModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Status Rotator",
  emoji: "🔁",
  description:
    "Owner-managed rotating bot presence with activity types, online states, and live placeholders.",
  version: "2.0.0",
  config: ConfigSchema,
  commands: [statusCommand],
  listeners: [interactionsListener],
  tasks: [rotateTask],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default statusModule;