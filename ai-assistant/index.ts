import { Module, DefineModule } from "#core/module-system/Module.js";

@DefineModule({
  name: "ai-assistant",
  displayName: "AI Assistant",
  emoji: "🤖",
  version: "1.0.0",
  description: "Semantically aware AI module using Gemini to answer server queries.",
})
export class AiAssistantModule extends Module {
  public override onLoad() {
    this.container.stores.registerPath(new URL("./commands/", import.meta.url));
    this.container.stores.registerPath(new URL("./listeners/", import.meta.url));
    this.container.stores.registerPath(new URL("./scheduled-tasks/", import.meta.url));
    return super.onLoad();
  }
}
