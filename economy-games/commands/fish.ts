import { defineCommand, type CommandContext } from "lumi/commands";
import { runGrindCommand } from "./work.js";

export default defineCommand({
  name: "fish",
  description: "Fish the docks and sell the morning catch.",
  build: () => ({
    name: "fish",
    description: "Fish the docks and sell the morning catch.",
  }),
  run: async (ctx: CommandContext) => {
    await runGrindCommand(ctx, "fish");
  },
});
