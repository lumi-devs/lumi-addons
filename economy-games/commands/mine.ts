import { defineCommand, type CommandContext } from "lumi/commands";
import { runGrindCommand } from "./work.js";

export default defineCommand({
  name: "mine",
  description: "Mine ore in the deep shaft for currency.",
  build: () => ({
    name: "mine",
    description: "Mine ore in the deep shaft for currency.",
  }),
  run: async (ctx: CommandContext) => {
    await runGrindCommand(ctx, "mine");
  },
});
