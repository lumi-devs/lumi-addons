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
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: "You are a helpful AI assistant for this Discord server. You can use tools to look up users, channels, and search the server's knowledge base. Use the provided tools to fetch real information before answering.",
          tools: [{ functionDeclarations: aiToolDeclarations }],
        },
      });

      // Pass the question directly as a string or an object structure the SDK expects
      let response = await chat.sendMessage(question);

      let attempts = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && attempts < 5) {
        attempts++;
        const parts = [];
        for (const call of response.functionCalls) {
          if (!call.name) continue;
          
          const result = await handleToolCall(call.name, call.args as Record<string, unknown>, interaction.guild!);
          parts.push({
            functionResponse: {
              name: call.name,
              response: result,
            },
          });
        }
        response = await chat.sendMessage(parts as any);
      }

      if (response.text) {
        const text = response.text.length > 2000 ? response.text.slice(0, 1995) + "..." : response.text;
        await this.replySuccess(interaction, "AI Response", text);
      } else {
        await this.replyInfo(interaction, "AI Response", "The AI didn't return any text.");
      }
    } catch (error: any) {
      this.container.logger.error("AI Error:", error);
      await this.replyError(
        interaction,
        "AI Error",
        `An error occurred while processing your request: ${error.message}`
      );
    }
  }
}
