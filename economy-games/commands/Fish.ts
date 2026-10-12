import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/lib/commands/CommandDef.js";
import type { CommandContext } from "@lumi-devs/lumi/lib/commands/Context.js";
import { MODULE_NAME } from "../utilities/Keys.js";
import { runGrindCommand } from "./Work.js";

export const fishDef: CommandDef = {
  name: "fish",
  module: MODULE_NAME,
  description: "Fish the docks and sell the morning catch.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () =>
    new SlashCommandBuilder()
      .setName("fish")
      .setDescription("Fish the docks and sell the morning catch."),
  run: async (ctx: CommandContext) => {
    await runGrindCommand(ctx, "fish");
  },
};
