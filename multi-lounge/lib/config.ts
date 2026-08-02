import { container } from "@sapphire/framework";
import { getService } from "#core/module-system/Service.js";
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
  const [baseChannelIds, threshold, maxExtras, template, cooldown] =
    await Promise.all([
      getService("config").getConfigList(
        guildId,
        MODULE_NAME,
        "base_channel_ids",
      ),
      get("busy_threshold"),
      get("max_extra_lounges"),
      get("name_template"),
      get("cooldown_seconds"),
    ]);
  return {
    baseChannelIds,
    busyThreshold: (threshold as number | null) ?? 2,
    maxExtras: (maxExtras as number | null) ?? 5,
    nameTemplate:
      ((template as string | null) ?? "Lounge {n}").trim() || "Lounge {n}",
    cooldownSeconds: (cooldown as number | null) ?? 10,
  };
}
