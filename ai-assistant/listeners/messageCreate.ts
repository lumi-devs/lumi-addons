import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Message } from "discord.js";

@ApplyOptions<Listener.Options>({
  name: "aiAssistantMessageCreate",
  event: Events.MessageCreate,
})
export default class AiAssistantMessageCreateListener extends Listener<typeof Events.MessageCreate> {
  public override async run(message: Message) {
    if (!message.inGuild() || message.author.bot) return;

    // --- Sentient Raid Defense (Test Mode) using Redis ---
    // Redis-based sliding window rate limiter (cluster-safe)
    const channelId = message.channel.id;
    const redisKey = `raid_defense:${message.guildId}:${channelId}`;
    
    // Increment counter for this channel
    const count = await this.container.redis.incr(redisKey);
    if (count === 1) {
      // 5-second sliding window
      await this.container.redis.expire(redisKey, 5);
    }

    if (count === 8) { // Only trigger exactly at 8 to prevent duplicate alarms
      this.container.logger.warn(`[Raid Defense] Velocity spike detected in ${channelId}. Dispatching AI evaluator...`);
      
      await this.container.tasks.create({
        name: "ai-request",
        payload: {
          channelId,
          guildId: message.guildId!,
          question: `A channel velocity spike was just detected (8+ messages in 5 seconds). Analyze the current context. Does this look like a spam bot raid, a hype train, or just an active conversation? Reply ONLY with "RAID", "HYPE", or "NORMAL" and one sentence of explanation. If it's a RAID, I will alert the mods.`,
          isReply: false
        }
      });
    }
    // ----------------------------------------------------

    const isMentioned = message.mentions.users.has(this.container.client.user!.id);
    const isReply = message.reference?.messageId && message.mentions.repliedUser?.id === this.container.client.user!.id;
    
    // Check if we are inside an active AI support thread
    const isSupportThread = message.channel.isThread() && message.channel.name.startsWith("support-");

    if (!isMentioned && !isReply && !isSupportThread) return;

    const config = this.container.db.config;
    const guildId = message.guildId;
    
    const apiUrl = await config.getModuleConfig(guildId, "ai-assistant", "apiUrl") as string || "https://openrouter.ai/api/v1";
    const apiKey = await config.getModuleConfig(guildId, "ai-assistant", "apiKey") as string || process.env.OPENROUTER_API_KEY || "";
    const modelName = await config.getModuleConfig(guildId, "ai-assistant", "modelName") as string || "meta-llama/llama-3.1-8b-instruct:free";

    try {
      await message.channel.sendTyping();

      const botMentionRegex = new RegExp(`<@!?${this.container.client.user!.id}>`, "g");
      const question = message.content.replace(botMentionRegex, "").trim();

      const history = [];

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
          this.container.logger.warn("AI Assistant: Failed to fetch replied message context.");
        }
      }

      await this.container.tasks.create({
        name: "ai-request",
        payload: {
          channelId: message.channel.id,
          messageId: message.id,
          question: question || "Did you need something?",
          guildId: message.guildId,
          isReply,
          history
        }
      });
      
    } catch (error: any) {
      this.container.logger.error("AI Listener Error:", error);
    }
  }
}
