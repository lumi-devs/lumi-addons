import { getModuleConfig } from "lumi/config";

export interface DragmeConfig {
  requestChannelId: string | null;
  timeoutMinutes: number;
  blacklistRoleIds: string[];
}

export async function getDragmeConfig(guildId: string): Promise<DragmeConfig> {
  const get = (key: string) => getModuleConfig(key, guildId);
  const [channel, timeout, blacklist] = await Promise.all([
    get("request_channel_id"),
    get("timeout_minutes"),
    get("blacklist_role_ids"),
  ]);
  return {
    requestChannelId: (channel as string | null) ?? null,
    timeoutMinutes: (timeout as number | null) ?? 5,
    blacklistRoleIds: normalizeIds(blacklist),
  };
}

function normalizeIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  if (typeof raw === "string" && raw.trim())
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}
