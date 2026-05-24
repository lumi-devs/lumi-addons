import { Module, EmberModule } from "#core/module-system/Module.js";
import { EmberEmojis } from "#utilities/assets.js";

@EmberModule({
  name: "emoji-stealer",
  displayName: "Emoji Stealer",
  emoji: EmberEmojis.DOWNLOAD,
  version: "1.0.0",
  description:
    "Steal custom emojis from other servers, messages, or URLs and add them to your server.",
})
export class EmojiStealerModule extends Module {
  public registerServices() {}

  public override onLoad() {
    this.container.stores.registerPath(new URL("./commands/", import.meta.url));
    return super.onLoad();
  }

  public override async deleteUserData(
    _userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // No-op: emoji-stealer does not store any user-specific data.
  }
}
