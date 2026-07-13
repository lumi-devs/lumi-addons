import { container } from "@sapphire/framework";
import { MODULE_NAME } from "../keys.js";

export interface ConfessionsConfig {
  channelId: string | null;
  logChannelId: string | null;
  reportChannelId: string | null;
  reportPingRoleId: string | null;
  mediaChannelId: string | null;
  autoThread: boolean;
  allowAttachments: boolean;
  cooldownMinutes: number;
}

export async function getConfessionsConfig(
  guildId: string,
): Promise<ConfessionsConfig> {
  const get = (key: string) =>
    container.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [
    channel,
    log,
    report,
    reportPing,
    media,
    thread,
    attachments,
    cooldown,
  ] = await Promise.all([
    get("confession_channel_id"),
    get("log_channel_id"),
    get("report_channel_id"),
    get("report_ping_role_id"),
    get("media_channel_id"),
    get("auto_thread"),
    get("allow_attachments"),
    get("cooldown_minutes"),
  ]);
  return {
    channelId: (channel as string | null) ?? null,
    logChannelId: (log as string | null) ?? null,
    reportChannelId: (report as string | null) ?? null,
    reportPingRoleId: (reportPing as string | null) ?? null,
    mediaChannelId: (media as string | null) ?? null,
    autoThread: (thread as boolean | null) ?? true,
    allowAttachments: (attachments as boolean | null) ?? true,
    cooldownMinutes: (cooldown as number | null) ?? 5,
  };
}
