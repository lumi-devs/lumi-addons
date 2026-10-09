import { defineCommand, type CommandContext } from "lumi/commands";
import { runGrindCommand } from "./work.js";

export default defineCommand({
  name: "beg",
  description: "Beg for spare change. Sometimes luck smiles.",
  build: () => ({
    name: "beg",
    description: "Beg for spare change. Sometimes luck smiles.",
  }),
  run: async (ctx: CommandContext) => {
    await runGrindCommand(ctx, "beg");
  },
});
