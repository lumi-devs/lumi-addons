import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { toStringArray } from "@lumi-devs/lumi/lib/module-system/ConfigSchema.js";
import { MODULE_NAME } from "./Keys.js";

export interface BoosterConfig {
  boosterRoleIds: string[];
  anchorRoleId: string | null;
  showcaseChannelId: string | null;
  logChannelId: string | null;
  maxShares: number;
  graceHours: number;
  nameMaxLength: number;
}

export async function getBoosterConfig(
  services: Container,
  guildId: string,
): Promise<BoosterConfig> {
  const get = (key: string) =>
    services.db.config.getModuleConfig(guildId, MODULE_NAME, key);

  const [boosterRoleIds, anchor, showcase, log, maxShares, grace, nameMax] =
    await Promise.all([
      get("booster_role_ids"),
      get("anchor_role_id"),
      get("showcase_channel_id"),
      get("log_channel_id"),
      get("max_shares"),
      get("grace_hours"),
      get("name_max_length"),
    ]);

  return {
    boosterRoleIds: toStringArray(boosterRoleIds),
    anchorRoleId: typeof anchor === "string" && anchor.length > 0 ? anchor : null,
    showcaseChannelId: typeof showcase === "string" && showcase.length > 0 ? showcase : null,
    logChannelId: typeof log === "string" && log.length > 0 ? log : null,
    maxShares: typeof maxShares === "number" && Number.isFinite(maxShares) ? maxShares : 3,
    graceHours: typeof grace === "number" && Number.isFinite(grace) ? grace : 24,
    nameMaxLength: typeof nameMax === "number" && Number.isFinite(nameMax) ? nameMax : 32,
  };
}
