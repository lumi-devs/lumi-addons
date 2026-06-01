import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { ApplyOptions } from "@sapphire/decorators";
import { GoogleGenAI } from "@google/genai";

interface AutoTranslatePayload {
  channelId: string;
  messageId: string;
  content: string;
}

@ApplyOptions<ScheduledTask.Options>({
  name: "auto-translate",
})
export default class AutoTranslateTask extends ScheduledTask {
  public async run(payload: AutoTranslatePayload) {
    const { channelId, messageId, content } = payload;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return;
    }

    try {
      const channel = await this.container.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;

      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction: "You are a language detection and translation assistant. You must analyze the user's message. If the message is written primarily in English, reply EXACTLY with the word 'ENGLISH'. If the message is written in any other language, translate it to English and reply ONLY with the translated text. Do not include any other commentary, quotes, or conversational filler.",
        },
      });

      const response = await chat.sendMessage(content);
      const text = response.text ? response.text.trim() : "";

      if (!text || text === "ENGLISH" || text === "ENGLISH.") {
        return;
      }

      const originalMsg = await channel.messages.fetch(messageId).catch(() => null);
      if (originalMsg) {
        await originalMsg.reply({
          content: `-# ${text}`,
          allowedMentions: { repliedUser: false },
        });
      }
    } catch (error: any) {
      // 429 Too Many Requests -> Throw error to let BullMQ retry automatically
      if (error.status === 429 || error.message.includes("429") || error.message.includes("quota") || error.message.includes("rate limit") || error.message.includes("ConnectionRefused")) {
        throw error;
      }
      this.container.logger.error("Auto Translate Task Error:", error);
    }
  }
}
