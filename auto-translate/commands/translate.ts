import { ApplyOptions } from "@sapphire/decorators";
import { Command, type Args } from "@sapphire/framework";
import {
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
  type Message,
  ApplicationCommandType,
} from "discord.js";
import { fetch as sfetch, FetchResultTypes } from "@sapphire/fetch";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";

@ApplyOptions<BaseCommand.Options>({
  name: "translate",
  aliases: ["t"],
  description: "Translate text to English",
  permissionLevel: PermissionLevel.USER,
  generateDashLessAliases: true,
})
export class TranslateCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    // Slash Command
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes(this.integrationTypes)
        .addStringOption((opt) =>
          opt
            .setName("text")
            .setDescription("The text to translate")
            .setRequired(true),
        ),
    );

    // Context Menu Command (Apps -> Translate)
    registry.registerContextMenuCommand((builder) =>
      builder
        .setName("Translate to English")
        .setType(ApplicationCommandType.Message)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes(this.integrationTypes),
    );
  }

  // Handle Slash Command
  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const text = interaction.options.getString("text", true);

    const translated = await this.fetchTranslation(text);
    if (!translated) {
      return this.replyError(
        interaction,
        "Failed",
        "Could not translate text.",
      );
    }

    return interaction.editReply(`-# ${translated}`);
  }

  // Handle Right-Click Context Menu
  public override async contextMenuRun(
    interaction: MessageContextMenuCommandInteraction,
  ) {
    await interaction.deferReply();
    const message = interaction.targetMessage;

    if (!message.content) {
      return this.replyError(interaction, "Failed", "No text to translate.");
    }

    const translated = await this.fetchTranslation(message.content);
    if (!translated) {
      return this.replyError(
        interaction,
        "Failed",
        "Could not translate text.",
      );
    }

    return interaction.editReply(`-# ${translated}`);
  }

  // Handle Prefix Command (e.g. ,translate text OR replying with ,translate)
  public override async messageRun(message: Message, args: Args) {
    let textToTranslate = await args.rest("string").catch(() => "");

    // If no text was provided directly, check if the user is replying to another message
    if (!textToTranslate && message.reference?.messageId) {
      const referencedMessage = await message.channel.messages
        .fetch(message.reference.messageId)
        .catch(() => null);
      if (referencedMessage && referencedMessage.content) {
        textToTranslate = referencedMessage.content;
      }
    }

    if (!textToTranslate) {
      const reply = await message.reply(
        "Please provide text to translate or reply to a message.",
      );
      return reply;
    }

    const translated = await this.fetchTranslation(textToTranslate);
    if (!translated) {
      const reply = await message.reply("Could not translate text.");
      return reply;
    }

    return message.reply({
      content: `-# ${translated}`,
      allowedMentions: { repliedUser: true },
    });
  }

  private async fetchTranslation(text: string): Promise<string | null> {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(
      text,
    )}`;

    try {
      // Response shape: [[["translated", "original", ...], ...], ...]
      const data = await sfetch<[Array<[string, ...unknown[]]>]>(
        url,
        FetchResultTypes.JSON,
      );
      if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
      return data[0]
        .map((item) => item[0])
        .join("")
        .trim();
    } catch (e) {
      this.container.logger.error("Translation error", e);
      return null;
    }
  }
}
