import type { Container } from "#src/lib/Services.js";
import { MODULE_NAME } from "./Keys.js";

export interface ConfessionsConfig {
  channelId: string | null;
  logChannelId: string | null;
  reportChannelId: string | null;
  reportPingRoleId: string | null;
  autoThread: boolean;
  allowAttachments: boolean;
  cooldownMinutes: number;
  replyDm: boolean;
}

export async function getConfessionsConfig(
  services: Container,
  guildId: string,
): Promise<ConfessionsConfig> {
  const get = (key: string) =>
    services.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [
    channel,
    log,
    report,
    reportPing,
    thread,
    attachments,
    cooldown,
    replyDm,
  ] = await Promise.all([
    get("confession_channel_id"),
    get("log_channel_id"),
    get("report_channel_id"),
    get("report_ping_role_id"),
    get("auto_thread"),
    get("allow_attachments"),
    get("cooldown_minutes"),
    get("reply_dm_notifications"),
  ]);
  return {
    channelId: typeof channel === "string" && channel.length > 0 ? channel : null,
    logChannelId: typeof log === "string" && log.length > 0 ? log : null,
    reportChannelId: typeof report === "string" && report.length > 0 ? report : null,
    reportPingRoleId: typeof reportPing === "string" && reportPing.length > 0 ? reportPing : null,
    autoThread: typeof thread === "boolean" ? thread : true,
    allowAttachments: typeof attachments === "boolean" ? attachments : true,
    cooldownMinutes: typeof cooldown === "number" ? cooldown : 5,
    replyDm: typeof replyDm === "boolean" ? replyDm : true,
  };
}
