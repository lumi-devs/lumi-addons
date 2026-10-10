import { defineCommand, type CommandContext } from "lumi/commands";
import { isJailed } from "../lib/crime.js";
import { getJail } from "../lib/store.js";
import { crimePickerCard } from "../lib/ui.js";

export default defineCommand({
  name: "crime",
  description: "Pick a crime, from pickpocketing to cybercrime. Fail and face jail.",
  build: () => ({
    name: "crime",
    description:
      "Pick a crime, from pickpocketing to cybercrime. Fail and face jail.",
  }),
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId;
    if (!guildId) {
      await ctx.replyError("Guild Only", "This command only works inside a server.");
      return;
    }
    const jail = await getJail(guildId, ctx.user.id);
    if (isJailed(jail)) {
      await ctx.replyError(
        "Jailed",
        `You are serving time for **${jail!.reason}**. Released <t:${Math.floor(jail!.until / 1000)}:R>.`,
      );
      return;
    }
    await ctx.reply(crimePickerCard(ctx.user.id), { ephemeral: false });
  },
});
