import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { toStringArray } from "@lumi-devs/lumi/lib/module-system/ConfigSchema.js";
import { MODULE_NAME } from "./Keys.js";

export interface LoungeConfig {
  baseChannelIds: string[];
  busyThreshold: number;
  maxExtras: number;
  nameTemplate: string;
  cooldownSeconds: number;
}

export async function getLoungeConfig(
  services: Container,
  guildId: string,
): Promise<LoungeConfig> {
  const [baseChannelIds, threshold, maxExtras, template, cooldown] =
    await Promise.all([
      services.db.config.getModuleConfig(guildId, MODULE_NAME, "base_channel_ids"),
      services.db.config.getModuleConfig(guildId, MODULE_NAME, "busy_threshold"),
      services.db.config.getModuleConfig(guildId, MODULE_NAME, "max_extra_lounges"),
      services.db.config.getModuleConfig(guildId, MODULE_NAME, "name_template"),
      services.db.config.getModuleConfig(guildId, MODULE_NAME, "cooldown_seconds"),
    ]);

  return {
    baseChannelIds: toStringArray(baseChannelIds),
    busyThreshold: typeof threshold === "number" ? threshold : 2,
    maxExtras: typeof maxExtras === "number" ? maxExtras : 5,
    nameTemplate:
      typeof template === "string" && template.trim().length > 0
        ? template.trim()
        : "Lounge {n}",
    cooldownSeconds: typeof cooldown === "number" ? cooldown : 10,
  };
}
