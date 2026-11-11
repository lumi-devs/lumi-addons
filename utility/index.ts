import { defineModule, type ModuleDefinition } from "@lumi/module-kit";
import { z } from "zod";
import { stealCommand } from "./commands/steal.js";
import { translateCommand } from "./commands/translate.js";

const ModuleName = "utility";

const ConfigSchema = z.object({});

const module: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Utility",
  emoji: "⚙️",
  description: "Steal custom emojis into the server and translate text between languages.",
  version: "2.0.0",
  config: ConfigSchema,
  commands: [stealCommand, translateCommand],
  listeners: [],
  tasks: [],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default module;
