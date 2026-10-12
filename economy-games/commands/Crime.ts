import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { MODULE_NAME } from "../utilities/Keys.js";
import { isJailed } from "../utilities/Crime.js";
import { getJail } from "../utilities/Store.js";
import { crimePickerCard } from "../utilities/Ui.js";

export const crimeDef: CommandDef = {
  name: "crime",
  module: MODULE_NAME,
  description: "Pick a crime, from pickpocketing to cybercrime. Fail and face jail.",
  guildOnly: true,
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () =>
    new SlashCommandBuilder()
      .setName("crime")
      .setDescription("Pick a crime, from pickpocketing to cybercrime. Fail and face jail."),
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.replyError("Guild Only", "This command only works inside a server.");
      return;
    }
    const jail = await getJail(ctx.services, guildId, ctx.user.id);
    if (isJailed(jail)) {
      await ctx.replyError(
        "Jailed",
        `You are serving time for **${jail!.reason}**. Released <t:${Math.floor(jail!.until / 1000)}:R>.`,
      );
      return;
    }
    await ctx.reply(crimePickerCard(ctx.user.id), { ephemeral: false });
  },
};
