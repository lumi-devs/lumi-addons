import { Module, DefineModule } from "#core/module-system/Module.js";
import { Emojis } from "#utilities/assets.js";

@DefineModule({
  name: "emoji-stealer",
  displayName: "Emoji Stealer",
  emoji: Emojis.DOWNLOAD,
  version: "1.0.0",
  description:
    "Steal custom emojis from other servers, messages, or URLs and add them to your server.",
})
export class EmojiStealerModule extends Module {
  public override async deleteUserData(
    _userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // No-op: emoji-stealer does not store any user-specific data.
  }
}
