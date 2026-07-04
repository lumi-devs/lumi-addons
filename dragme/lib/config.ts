import { container } from "@sapphire/framework";
import { parseConfigList } from "#core/module-system/Module.js";
import { MODULE_NAME } from "../keys.js";

export interface DragmeConfig {
  requestChannelId: string | null;
  timeoutMinutes: number;
  graceMinutes: number;
  blacklistRoleIds: string[];
}

export async function getDragmeConfig(guildId: string): Promise<DragmeConfig> {
  const get = (key: string) =>
    container.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [channel, timeout, grace, blacklist] = await Promise.all([
    get("request_channel_id"),
    get("timeout_minutes"),
    get("grace_minutes"),
    get("blacklist_role_ids"),
  ]);
  return {
    requestChannelId: (channel as string | null) ?? null,
    timeoutMinutes: (timeout as number | null) ?? 5,
    graceMinutes: (grace as number | null) ?? 10,
    blacklistRoleIds: parseConfigList(blacklist),
  };
}
