import { Module, EmberModule } from "#core/module-system/Module.js";

@EmberModule({
  name: "tags",
  displayName: "Tags",
  emoji: "🏷️",
  version: "1.0.0",
  description: "Create and manage custom server tags and triggers.",
})
export class TagsModule extends Module {
  public registerServices() {}

  public override onLoad() {
    this.container.stores.registerPath(new URL("./commands/", import.meta.url));
    return super.onLoad();
  }

  public override async deleteUserData(
    _userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // No-op: tags are guild-specific custom responses, not tied to a single user's personal/private data.
  }
}
