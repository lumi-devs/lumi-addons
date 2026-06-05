import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction, TextBasedChannel } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { processAiRequest } from "../lib/ai-executor.js";

@ApplyOptions<BaseCommand.Options>({
  name: "tldr",
  description: "Summarize recent chat history to quickly catch up on drama or context.",
  permissionLevel: PermissionLevel.MODERATOR,
})
export class TldrCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addIntegerOption((opt) =>
          opt
            .setName("messages")
            .setDescription("Number of messages to read (up to 100)")
            .setMinValue(5)
            .setMaxValue(100)
            .setRequired(true)
        )
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const amount = interaction.options.getInteger("messages", true);
    
    // Defer ephemeral so only the mod sees the summary
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
      return this.replyError(interaction, "Error", "This command can only be used in a server text channel.");
    }

    try {
      const channel = interaction.channel as TextBasedChannel;
      const messages = await channel.messages.fetch({ limit: amount });
      
      if (messages.size === 0) {
        return this.replyError(interaction, "No Data", "No messages found to summarize.");
      }

      // Sort messages chronologically (oldest to newest)
      const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      
      const chatLog = sortedMessages
        .map(m => `[${m.createdAt.toLocaleTimeString()}] ${m.author.username}: ${m.content}`)
        .join("\n");

      const config = this.container.db.config;
      const guildId = interaction.guildId!;
      
      const apiUrl = await config.getModuleConfig(guildId, "ai-assistant", "apiUrl") as string || "https://openrouter.ai/api/v1";
      const apiKey = await config.getModuleConfig(guildId, "ai-assistant", "apiKey") as string || process.env.OPENROUTER_API_KEY || "";
      const modelName = await config.getModuleConfig(guildId, "ai-assistant", "modelName") as string || "meta-llama/llama-3-8b-instruct:free";

      const prompt = `Please summarize the following chat log. Ignore casual memes. Identify the core topic or conflict, and highlight who was involved in 3 concise bullet points:\n\n${chatLog}`;

      const responseText = await processAiRequest(
        apiUrl,
        apiKey,
        modelName,
        prompt,
        interaction.guild,
        channel
      );

      const finalContent = responseText.length > 2000 ? responseText.slice(0, 1995) + "..." : responseText;
      
      const { makeInfoCard } = await import("#utilities/cards.js");
      await interaction.editReply(makeInfoCard(`TL;DR for the last ${amount} messages`, finalContent));

    } catch (error: any) {
      this.container.logger.error("TLDR Command Error:", error);
      await this.replyError(interaction, "AI Error", `Failed to summarize: ${error.message}`);
    }
  }
}
