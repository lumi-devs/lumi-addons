import { ApplyOptions } from "@sapphire/decorators";
import { BaseCommand, type CommandContext } from "lumi/commands";
import { runGrindCommand } from "./work.js";

@ApplyOptions<BaseCommand.Options>({
  name: "mine",
  description: "Mine ore in the deep shaft for currency.",
  preconditions: ["GuildOnly"],
  prefixEnabled: true,
  cooldownLimit: 2,
  cooldownDelay: 5000,
})
export class MineCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext) {
    await runGrindCommand(ctx, "mine");
  }
}
