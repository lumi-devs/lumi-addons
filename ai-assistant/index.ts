import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerRpcHandler, deregisterRpcHandler } from "#lib/rabbit.js";
import { processAiRequest } from "./lib/ai-executor.js";
import type { TextBasedChannel } from "discord.js";

@DefineModule({
  name: "ai-assistant",
  displayName: "AI Helper",
  emoji: "🧠",
  version: "2.0.0",
  description: "Universal OpenAI-compatible AI helper with web search, docs, and Discord context.",
  configSchema: cfg.object({
    apiUrl: cfg.string({
      label: "API Base URL",
      description: "The base URL for the OpenAI-compatible API (e.g. OpenRouter, Groq, Ollama).",
      default: "https://openrouter.ai/api/v1",
    }),
    apiKey: cfg.string({
      label: "API Key",
      description: "API key for the provider (can be empty if using local Ollama).",
      default: "",
    }),
    modelName: cfg.string({
      label: "Model Name",
      description: "Which model to request (e.g. meta-llama/llama-3.1-8b-instruct:free).",
      default: "meta-llama/llama-3.1-8b-instruct:free",
    }),
  }),
})
export class AiHelperModule extends Module {
  public override onLoad() {
    this.container.stores.registerPath(new URL("./commands/", import.meta.url));
    this.container.stores.registerPath(new URL("./listeners/", import.meta.url));
    
    // Register RabbitMQ RPC so the Dashboard can ask the AI questions directly
    registerRpcHandler("aiAssistantAsk", async (req: any) => {
      const { guildId, question } = req;
      const config = this.container.db.config;
      const apiUrl = await config.getModuleConfig(guildId, "ai-assistant", "apiUrl") as string || "https://openrouter.ai/api/v1";
      const apiKey = await config.getModuleConfig(guildId, "ai-assistant", "apiKey") as string || process.env.OPENROUTER_API_KEY || "";
      const modelName = await config.getModuleConfig(guildId, "ai-assistant", "modelName") as string || "meta-llama/llama-3.1-8b-instruct:free";
      
      const guild = await this.container.client.guilds.fetch(guildId);
      const channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased()) as TextBasedChannel;
      
      if (!channel) return { success: false, error: "No valid channel found for context." };

      const res = await processAiRequest(apiUrl, apiKey, modelName, question, guild, channel);
      return { success: true, answer: res };
    });

    return super.onLoad();
  }

  public override onUnload() {
    deregisterRpcHandler("aiAssistantAsk");
    return super.onUnload();
  }
}
