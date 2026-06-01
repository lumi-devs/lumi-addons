import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { ApplyOptions } from "@sapphire/decorators";

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
    
    try {
      const channel = await this.container.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;

      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(content)}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        this.container.logger.warn(`Google Translate API error: ${res.statusText}`);
        return;
      }

      const data = await res.json();
      
      // Google Translate returns an array structure. 
      // data[0] contains the translated segments.
      // data[2] contains the detected source language (e.g., 'en', 'es', 'fr')
      
      if (!data || !data[0] || !data[2]) return;

      const detectedLang = data[2];
      
      // If it's already English, don't translate it
      if (detectedLang === "en") {
        return;
      }

      const translatedText = data[0].map((item: any) => item[0]).join("").trim();

      if (!translatedText || translatedText.toLowerCase() === content.toLowerCase()) {
        return;
      }

      const originalMsg = await channel.messages.fetch(messageId).catch(() => null);
      if (originalMsg) {
        await originalMsg.reply({
          content: `-# ${translatedText}`,
          allowedMentions: { repliedUser: false },
        });
      }
    } catch (error: any) {
      this.container.logger.error("Auto Translate Task Error:", error);
    }
  }
}
