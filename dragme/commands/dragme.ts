import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { type ChatInputCommandInteraction, type GuildMember } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { BaseCommand } from "#lib/commands.js";
import { createDragRequest } from "../lib/create-request.js";

@ApplyOptions<BaseCommand.Options>({
  name: "dragme",
  description: "Ask the people in a member's voice channel to drag you in.",
  preconditions: ["GuildOnly"],
  cooldownLimit: 2,
  cooldownDelay: 5000,
})
export class DragmeCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((o) =>
          o
            .setName("user")
            .setDescription("The user in the voice channel you want to join")
            .setRequired(true),
        ),
    );
  }

  public override async chatInputRun(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const targetUser = interaction.options.getUser("user", true);
    const targetMember = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);
    if (!targetMember) {
      return this.replyError(
        interaction,
        "Can't Do That",
        "Could not find that member in the server.",
      );
    }
    const targetChannel = targetMember.voice.channel;
    if (!targetChannel) {
      return this.replyError(
        interaction,
        "Can't Do That",
        "That user isn't in a voice channel right now.",
      );
    }

    const result = await createDragRequest(
      interaction.member as GuildMember,
      targetMember,
    );
    return result.ok
      ? this.replySuccess(
          interaction,
          "Request Posted",
          `Asked the members of ${channelMention(targetChannel.id)} to drag you in.`,
        )
      : this.replyError(interaction, "Can't Do That", result.reason);
  }
}
