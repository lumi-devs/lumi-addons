import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Message } from "discord.js";
import { GoogleGenAI } from "@google/genai";
import { aiToolDeclarations, handleToolCall } from "../lib/ai-tools.js";

@ApplyOptions<Listener.Options>({
  name: "aiAssistantMessageCreate",
  event: Events.MessageCreate,
})
export default class AiAssistantMessageCreateListener extends Listener<
  typeof Events.MessageCreate
> {
  public override async run(message: Message) {
    if (!message.inGuild() || message.author.bot) return;

    // Check if the bot was mentioned
    const isMentioned = message.mentions.users.has(this.container.client.user!.id);
    
    // Check if it's a direct reply to the bot
    const isReply = message.reference?.messageId && message.mentions.repliedUser?.id === this.container.client.user!.id;

    if (!isMentioned && !isReply) return;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.container.logger.warn("AI Assistant: GEMINI_API_KEY is missing.");
      return;
    }

    try {
      await message.channel.sendTyping();

      // Clean the prompt by removing the bot's mention string
      const botMentionRegex = new RegExp(`<@!?${this.container.client.user!.id}>`, "g");
      const question = message.content.replace(botMentionRegex, "").trim();

      if (!question && !isReply) {
        await message.reply("Did you need something? You can ask me questions about this server!");
        return;
      }

      // Context array for the conversation
      const history = [];

      // If it's a reply, fetch the referenced message so Gemini has context of what it's replying to
      if (message.reference?.messageId) {
        try {
          const parentMsg = await message.channel.messages.fetch(message.reference.messageId);
          if (parentMsg.content) {
            history.push({
              role: parentMsg.author.id === this.container.client.user!.id ? "model" : "user",
              parts: [{ text: parentMsg.content }]
            });
          }
        } catch (err) {
          this.container.logger.warn("AI Assistant: Failed to fetch replied message for context.", err);
        }
      }

      await this.container.tasks.create({
        name: "ai-request",
        payload: {
          channelId: message.channel.id,
          messageId: message.id,
          question,
          guildId: message.guildId,
          isReply,
          history
        }
      });

    } catch (error: any) {
      this.container.logger.error("AI Error in message listener:", error);
      await message.reply(`An error occurred while queuing your request: ${error.message}`);
    }
  }
}
