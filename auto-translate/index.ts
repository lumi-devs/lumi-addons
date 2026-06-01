import { DefineModule, Module } from "#core/module-system/Module.js";

@DefineModule({
  name: "auto-translate",
  displayName: "Auto Translate",
  emoji: "🌐",
  version: "1.0.0",
  description: "Automatically translates non-English messages and replies with the translation using Gemini API.",
})
export class AutoTranslateModule extends Module {
  public override onLoad() {
    this.container.stores.registerPath(new URL("./listeners/", import.meta.url));
    this.container.stores.registerPath(new URL("./scheduled-tasks/", import.meta.url));
    return super.onLoad();
  }
}
