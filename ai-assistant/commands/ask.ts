import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction, TextBasedChannel } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { processAiRequest } from "../lib/ai-executor.js";

@ApplyOptions<BaseCommand.Options>({
  name: "ask",
  description: "Ask the AI assistant to search the web, read docs, or look up Discord data.",
  permissionLevel: PermissionLevel.USER,
})
export class AskCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((opt) =>
          opt
            .setName("question")
            .setDescription("What do you want to ask?")
            .setRequired(true)
        )
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const question = interaction.options.getString("question", true);
    
    await interaction.deferReply();

    const config = this.container.db.config;
    const guildId = interaction.guildId!;
    
    const apiUrl = await config.getModuleConfig(guildId, "ai-assistant", "apiUrl") as string || "https://openrouter.ai/api/v1";
    const apiKey = await config.getModuleConfig(guildId, "ai-assistant", "apiKey") as string || process.env.OPENROUTER_API_KEY || "";
    const modelName = await config.getModuleConfig(guildId, "ai-assistant", "modelName") as string || "meta-llama/llama-3.1-8b-instruct:free";

    try {
      if (!interaction.guild || !interaction.channel) {
         return this.replyError(interaction, "Error", "This command can only be used in a server channel.");
      }

      const responseText = await processAiRequest(
        apiUrl,
        apiKey,
        modelName,
        question,
        interaction.guild,
        interaction.channel as TextBasedChannel
      );

      const finalContent = responseText.length > 2000 
        ? responseText.slice(0, 1995) + "..." 
        : responseText;

      await interaction.editReply({ content: finalContent });
    } catch (error: any) {
      this.container.logger.error("AI Command Error:", error);
      await this.replyError(interaction, "AI Error", `Failed to process request: ${error.message}`);
    }
  }
}
