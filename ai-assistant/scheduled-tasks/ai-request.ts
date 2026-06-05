import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { ApplyOptions } from "@sapphire/decorators";
import type { TextBasedChannel } from "discord.js";
import { processAiRequest } from "../lib/ai-executor.js";

export interface AiRequestPayload {
  channelId: string;
  guildId: string;
  question: string;
  isReply: boolean;
  history?: Array<{ role: string; parts: Array<{ text: string }> }>;
  messageId?: string;
  isSupportTicket?: boolean;
}

@ApplyOptions<ScheduledTask.Options>({
  name: "ai-request",
})
export default class AiRequestTask extends ScheduledTask {
  public async run(payload: AiRequestPayload) {
    const { channelId, guildId, question, history, messageId, isSupportTicket } = payload;
    
    const config = this.container.db.config;
    const apiUrl = await config.getModuleConfig(guildId, "ai-assistant", "apiUrl") as string || "https://openrouter.ai/api/v1";
    const apiKey = await config.getModuleConfig(guildId, "ai-assistant", "apiKey") as string || process.env.OPENROUTER_API_KEY || "";
    const modelName = await config.getModuleConfig(guildId, "ai-assistant", "modelName") as string || "meta-llama/llama-3-8b-instruct:free";

    try {
      const channel = await this.container.client.channels.fetch(channelId) as TextBasedChannel;
      if (!channel) return;

      const guild = await this.container.client.guilds.fetch(guildId);
      if (!guild) return;

      const responseText = await processAiRequest(
        apiUrl,
        apiKey,
        modelName,
        question,
        guild,
        channel,
        history
      );

      const finalContent = responseText.length > 2000 ? responseText.slice(0, 1995) + "..." : responseText;
      
      const { makeInfoCard } = await import("#utilities/cards.js");
      const replyCard = makeInfoCard("AI Assistant", finalContent);

      if (messageId) {
        try {
          const originalMsg = await channel.messages.fetch(messageId);
          await originalMsg.reply({ ...replyCard, allowedMentions: { repliedUser: true } });
        } catch (e) {
          await channel.send(replyCard);
        }
      } else {
        await channel.send(replyCard);
      }

    } catch (error: any) {
      // Automatic BullMQ retry if rate limited
      if (error.status === 429 || error.message.includes("429")) {
        this.container.logger.warn(`AI API rate limit hit, queue will backoff and retry: ${error.message}`);
        throw error;
      }
      this.container.logger.error("AI Task Error:", error);
      
      const channel = await this.container.client.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        await channel.send(`An error occurred processing the AI request: ${error.message}`);
      }
    }
  }
}
