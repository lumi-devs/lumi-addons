import { DefineModule, Module } from "#core/module-system/Module.js";

@DefineModule({
  name: "auto-translate",
  displayName: "Translate",
  emoji: "🌐",
  version: "1.1.2",
  description:
    "Translate messages to English via slash command, right-click context menu, or prefix command (Google Translate).",
})
export class AutoTranslateModule extends Module {
  public override async deleteUserData(
    _userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // No-op: nothing is persisted; translations are request/response only.
  }
}
