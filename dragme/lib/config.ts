import { container } from "@sapphire/framework";
import { getService } from "#core/module-system/Service.js";
import { MODULE_NAME } from "../keys.js";

export interface DragmeConfig {
  requestChannelId: string | null;
  timeoutMinutes: number;
  graceMinutes: number;
  blacklistRoleIds: string[];
  grantHiddenPerms: boolean;
}

export async function getDragmeConfig(guildId: string): Promise<DragmeConfig> {
  const get = (key: string) =>
    container.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [channel, timeout, grace, blacklistRoleIds, grant] = await Promise.all([
    get("request_channel_id"),
    get("timeout_minutes"),
    get("grace_minutes"),
    getService("config").getConfigList(
      guildId,
      MODULE_NAME,
      "blacklist_role_ids",
    ),
    get("grant_hidden_perms"),
  ]);
  return {
    requestChannelId: (channel as string | null) ?? null,
    timeoutMinutes: (timeout as number | null) ?? 5,
    graceMinutes: (grace as number | null) ?? 10,
    blacklistRoleIds,
    grantHiddenPerms: (grant as boolean | null) ?? true,
  };
}
