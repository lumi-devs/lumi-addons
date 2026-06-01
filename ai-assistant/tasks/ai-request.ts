import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { ApplyOptions } from "@sapphire/decorators";
import { GoogleGenAI } from "@google/genai";
import { aiToolDeclarations, handleToolCall } from "../lib/ai-tools.js";

interface AiRequestPayload {
  channelId: string;
  messageId?: string;
  question: string;
  guildId: string;
  isReply: boolean;
  history?: Array<{ role: string; parts: Array<{ text: string }> }>;
}

@ApplyOptions<ScheduledTask.Options>({
  name: "ai-request",
})
export default class AiRequestTask extends ScheduledTask {
  public async run(payload: AiRequestPayload) {
    const { channelId, messageId, question, guildId, isReply, history } = payload;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      this.container.logger.warn("AI Assistant: GEMINI_API_KEY is missing for task.");
      return;
    }

    try {
      const channel = await this.container.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;

      const guild = await this.container.client.guilds.fetch(guildId);
      if (!guild) return;

      const ai = new GoogleGenAI({ apiKey });
      const chatConfig: any = {
        model: "gemini-2.5-flash",
        config: {
          systemInstruction:
            "You are a helpful AI assistant for this Discord server. You can use tools to look up users, channels, and search the server's knowledge base. Use the provided tools to fetch real information before answering.",
          tools: [{ functionDeclarations: aiToolDeclarations }],
        },
      };

      if (history && history.length > 0) {
        chatConfig.history = history;
      }

      const chat = ai.chats.create(chatConfig);

      let response = await chat.sendMessage(question || "Can you help me?");

      let attempts = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && attempts < 5) {
        attempts++;
        const parts = [];
        for (const call of response.functionCalls) {
          if (!call.name) continue;

          const result = await handleToolCall(
            call.name,
            call.args as Record<string, unknown>,
            guild
          );
          parts.push({
            functionResponse: {
              name: call.name,
              response: result,
            },
          });
        }
        response = await chat.sendMessage(parts as any);
      }

      const text = response.text
        ? response.text.length > 2000
          ? response.text.slice(0, 1995) + "..."
          : response.text
        : "The AI didn't return any text.";

      if (messageId) {
        try {
          const originalMsg = await channel.messages.fetch(messageId);
          await originalMsg.reply({ content: text, allowedMentions: { repliedUser: true } });
        } catch (e) {
          // Fallback if message was deleted
          await channel.send(text);
        }
      } else {
        await channel.send(text);
      }
    } catch (error: any) {
      // 429 Too Many Requests -> Throw error to let BullMQ retry automatically
      if (error.status === 429 || error.message.includes("429") || error.message.includes("quota") || error.message.includes("rate limit") || error.message.includes("ConnectionRefused")) {
        this.container.logger.warn(`AI API rate limit hit, queue will retry: ${error.message}`);
        throw error; // This triggers BullMQ's exponential backoff retry mechanism
      }
      
      this.container.logger.error("AI Task Error:", error);
      
      // For non-recoverable errors, try to notify the user if possible
      try {
        const channel = await this.container.client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
          await channel.send(`An error occurred while processing your AI request: ${error.message}`);
        }
      } catch (e) {
        // Ignore
      }
    }
  }
}
