import { toStringArray } from "lumi";
import { getModuleConfig } from "lumi/config";

export interface LoungeConfig {
  baseChannelIds: string[];
  busyThreshold: number;
  maxExtras: number;
  nameTemplate: string;
  cooldownSeconds: number;
}

export async function getLoungeConfig(guildId: string): Promise<LoungeConfig> {
  const [baseChannelIds, threshold, maxExtras, template, cooldown] =
    await Promise.all([
      getModuleConfig("base_channel_ids", guildId),
      getModuleConfig("busy_threshold", guildId),
      getModuleConfig("max_extra_lounges", guildId),
      getModuleConfig("name_template", guildId),
      getModuleConfig("cooldown_seconds", guildId),
    ]);
  return {
    baseChannelIds: toStringArray(baseChannelIds),
    busyThreshold: (threshold as number | null) ?? 2,
    maxExtras: (maxExtras as number | null) ?? 5,
    nameTemplate:
      ((template as string | null) ?? "Lounge {n}").trim() || "Lounge {n}",
    cooldownSeconds: (cooldown as number | null) ?? 10,
  };
}
