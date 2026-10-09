import { getModuleConfig } from "lumi/config";
import { toStringArray } from "lumi";

export interface BoosterConfig {
  boosterRoleIds: string[];
  anchorRoleId: string | null;
  showcaseChannelId: string | null;
  logChannelId: string | null;
  maxShares: number;
  graceHours: number;
  nameMaxLength: number;
}

export async function getBoosterConfig(guildId: string): Promise<BoosterConfig> {
  const [boosterRoleIds, anchor, showcase, log, maxShares, grace, nameMax] =
    await Promise.all([
      getModuleConfig("booster_role_ids", guildId),
      getModuleConfig("anchor_role_id", guildId),
      getModuleConfig("showcase_channel_id", guildId),
      getModuleConfig("log_channel_id", guildId),
      getModuleConfig("max_shares", guildId),
      getModuleConfig("grace_hours", guildId),
      getModuleConfig("name_max_length", guildId),
    ]);
  return {
    boosterRoleIds: toStringArray(boosterRoleIds),
    anchorRoleId: typeof anchor === "string" && anchor ? anchor : null,
    showcaseChannelId: typeof showcase === "string" && showcase ? showcase : null,
    logChannelId: typeof log === "string" && log ? log : null,
    maxShares: typeof maxShares === "number" && Number.isFinite(maxShares) ? maxShares : 3,
    graceHours: typeof grace === "number" && Number.isFinite(grace) ? grace : 24,
    nameMaxLength: typeof nameMax === "number" && Number.isFinite(nameMax) ? nameMax : 32,
  };
}
