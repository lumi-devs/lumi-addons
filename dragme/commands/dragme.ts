import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import {
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { BaseCommand } from "#lib/commands.js";
import { createDragRequest } from "../lib/create-request.js";

@ApplyOptions<BaseCommand.Options>({
  name: "dragme",
  description: "Ask the people in a voice channel to drag you in.",
  preconditions: ["GuildOnly"],
})
export class DragmeCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("The voice channel you want to join")
            .addChannelTypes(
              ChannelType.GuildVoice,
              ChannelType.GuildStageVoice,
            )
            .setRequired(true),
        ),
    );
  }

  public override async chatInputRun(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const target = interaction.options.getChannel(
      "channel",
      true,
    ) as VoiceBasedChannel;
    const result = await createDragRequest(
      interaction.member as GuildMember,
      target,
    );
    return result.ok
      ? this.replySuccess(
          interaction,
          "Request Posted",
          `Asked the members of ${channelMention(target.id)} to drag you in.`,
        )
      : this.replyError(interaction, "Can't Do That", result.reason);
  }
}
