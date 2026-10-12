import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { MODULE_NAME } from "../utilities/Keys.js";
import { runGrindCommand } from "./Work.js";

export const begDef: CommandDef = {
  name: "beg",
  module: MODULE_NAME,
  description: "Beg for spare change. Sometimes luck smiles.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () =>
    new SlashCommandBuilder()
      .setName("beg")
      .setDescription("Beg for spare change. Sometimes luck smiles."),
  run: async (ctx: CommandContext) => {
    await runGrindCommand(ctx, "beg");
  },
};
