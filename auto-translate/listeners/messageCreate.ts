import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Message } from "discord.js";

@ApplyOptions<Listener.Options>({
  name: "autoTranslateMessageCreate",
  event: Events.MessageCreate,
})
export default class AutoTranslateMessageCreateListener extends Listener<
  typeof Events.MessageCreate
> {
  public override async run(message: Message) {
    if (!message.inGuild() || message.author.bot || !message.content) return;

    // Do not queue translation for very short messages (e.g. single emoji or "lol")
    if (message.content.length < 3) return;
    
    // Ignore commands (assuming prefix is ,)
    if (message.content.startsWith(",") || message.content.startsWith("!")) return;

    // Enqueue for translation
    await this.container.tasks.create("auto-translate", {
      channelId: message.channel.id,
      messageId: message.id,
      content: message.content,
    });
  }
}
