import { ApplyOptions } from "@sapphire/decorators";
import { time, TimestampStyles } from "@discordjs/formatters";
import { BaseCommand, type CommandContext } from "lumi/commands";
import { isJailed } from "../lib/crime.js";
import { getJail } from "../lib/store.js";
import { crimePickerCard } from "../lib/ui.js";

@ApplyOptions<BaseCommand.Options>({
  name: "crime",
  description: "Pick a crime, from pickpocketing to cybercrime. Fail and face jail.",
  preconditions: ["GuildOnly"],
  prefixEnabled: true,
  cooldownLimit: 2,
  cooldownDelay: 5000,
})
export class CrimeCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext) {
    const guildId = ctx.guildId!;
    const jail = await getJail(guildId, ctx.user.id);
    if (isJailed(jail)) {
      await ctx.replyError(
        "Jailed",
        `You are serving time for **${jail!.reason}**. Released ${time(new Date(jail!.until), TimestampStyles.RelativeTime)}.`,
      );
      return;
    }
    await ctx.reply(crimePickerCard(ctx.user.id), { ephemeral: false });
  }
}
