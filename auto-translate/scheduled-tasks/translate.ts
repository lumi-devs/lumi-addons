import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { ApplyOptions } from "@sapphire/decorators";

import LanguageDetect from "languagedetect";

const lngDetector = new LanguageDetect();

interface AutoTranslatePayload {
  channelId: string;
  messageId: string;
  content: string;
}

@ApplyOptions<ScheduledTask.Options>({
  name: "auto-translate",
})
export default class AutoTranslateTask extends ScheduledTask {
  public async run(payload: unknown) {
    this.container.logger.info("Auto Translate Task Payload:", payload);
    const { channelId, messageId, content } = payload as AutoTranslatePayload;
    
    if (!channelId) {
      this.container.logger.warn("Auto Translate Task Error: channelId is undefined! Payload was:", payload);
      return;
    }

    // Filter out english slang which might be mistaken for other languages
    const detected = lngDetector.detect(content, 3);
    const hasEnglishInTop = detected.some((d) => d[0] === "english" && (d[1] as number) > 0.15);
    if (hasEnglishInTop) {
      return;
    }

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
