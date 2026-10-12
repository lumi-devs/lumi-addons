import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { MODULE_NAME } from "../utilities/Keys.js";
import { runGrindCommand } from "./Work.js";

export const mineDef: CommandDef = {
  name: "mine",
  module: MODULE_NAME,
  description: "Mine ore in the deep shaft for currency.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () =>
    new SlashCommandBuilder()
      .setName("mine")
      .setDescription("Mine ore in the deep shaft for currency."),
  run: async (ctx: CommandContext) => {
    await runGrindCommand(ctx, "mine");
  },
};
