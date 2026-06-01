import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { GoogleGenAI } from "@google/genai";
import { aiToolDeclarations, handleToolCall } from "../lib/ai-tools.js";

@ApplyOptions<BaseCommand.Options>({
  name: "ask",
  description: "Ask the semantically aware AI a question about the server or knowledge base.",
  permissionLevel: PermissionLevel.USER,
})
export class AskCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: Command.Registry,
  ) {
    registry.registerChatInputCommand((builder: any) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((opt: any) =>
          opt
            .setName("question")
            .setDescription("What do you want to ask?")
            .setRequired(true),
        ),
    );
  }

  public override async chatInputRun(
    interaction: ChatInputCommandInteraction,
  ) {
    const question = interaction.options.getString("question", true);

    await interaction.deferReply();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return this.replyError(
        interaction,
        "Configuration Error",
        "GEMINI_API_KEY is not set in the environment."
      );
    }

    try {
      await this.container.tasks.create("ai-request", {
        channelId: interaction.channelId,
        question,
        guildId: interaction.guildId,
        isReply: false,
      });

      await this.replySuccess(interaction, "AI Request Queued", "Your request has been queued and will be processed shortly.");
    } catch (error: any) {
      this.container.logger.error("AI Error:", error);
      await this.replyError(interaction, "Error", `An error occurred while queuing your request: ${error.message}`);
    }
  }
}
