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

      // Conversational context: feed the recent channel messages as history so
      // the model can resolve references like "him", "her", "that user", or
      // "tell me more" to whoever/whatever was just discussed — instead of
      // defaulting to the asker. Bot messages map to the assistant role; others
      // are labelled with the speaker's display name so the model knows who said
      // (and who was mentioned in) each line.
      const botId = this.container.client.user!.id;
      const history: Array<{ role: string; parts: Array<{ text: string }> }> = [];

      try {
        const recent = await message.channel.messages.fetch({ limit: 8, before: message.id });
        const ordered = [...recent.values()].reverse(); // oldest → newest
        for (const m of ordered) {
          const content = m.content?.trim();
          if (!content) continue;
          const isBot = m.author.id === botId;
          const label = isBot ? "" : `${m.member?.displayName ?? m.author.username}: `;
          history.push({
            role: isBot ? "model" : "user",
            parts: [{ text: `${label}${content}`.slice(0, 600) }],
          });
        }
      } catch (err) {
        this.container.logger.warn("AI Assistant: Failed to fetch recent channel context.");
      }

      // If this is a reply to a message older than the recent window, make sure
      // that parent is still present as the most recent context line.
      if (message.reference?.messageId) {
        try {
          const parentMsg = await message.channel.messages.fetch(message.reference.messageId);
          const parentContent = parentMsg.content?.trim();
          if (parentContent && !history.some((h) => h.parts[0]?.text.includes(parentContent.slice(0, 60)))) {
            const isBot = parentMsg.author.id === botId;
            const label = isBot ? "" : `${parentMsg.member?.displayName ?? parentMsg.author.username}: `;
            history.push({
              role: isBot ? "model" : "user",
              parts: [{ text: `${label}${parentContent}`.slice(0, 600) }],
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
          history,
          author: {
            id: message.author.id,
            username: message.author.username,
            displayName: message.member?.displayName ?? message.author.displayName ?? message.author.username,
          }
        }
      });
      
    } catch (error: any) {
      this.container.logger.error("AI Listener Error:", error);
    }
  }
}
