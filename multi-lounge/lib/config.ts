import { container } from "@sapphire/framework";
import { parseConfigList } from "#core/module-system/Module.js";
import { MODULE_NAME } from "../keys.js";

export interface LoungeConfig {
  /** One or more permanent voice channels; each scales its own group. */
  baseChannelIds: string[];
  busyThreshold: number;
  maxExtras: number;
  nameTemplate: string;
  cooldownSeconds: number;
}

export async function getLoungeConfig(guildId: string): Promise<LoungeConfig> {
  const get = (key: string) =>
    container.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [bases, threshold, maxExtras, template, cooldown] = await Promise.all([
    get("base_channel_ids"),
    get("busy_threshold"),
    get("max_extra_lounges"),
    get("name_template"),
    get("cooldown_seconds"),
  ]);
  return {
    baseChannelIds: parseConfigList(bases),
    busyThreshold: (threshold as number | null) ?? 2,
    maxExtras: (maxExtras as number | null) ?? 5,
    nameTemplate:
      ((template as string | null) ?? "Lounge {n}").trim() || "Lounge {n}",
    cooldownSeconds: (cooldown as number | null) ?? 10,
  };
}
