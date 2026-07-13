import { ChannelType } from "discord.js";
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { deleteForUser } from "./lib/data.js";

@DefineModule({
  name: "confessions",
  displayName: "Confessions",
  emoji: "🕊️",
  version: "1.0.0",
  description:
    "Anonymous confessions posted through /confess, with optional threads, anonymous replies, per-author cooldowns, and moderator bans — identities are never stored in the clear.",
  configSchema: cfg.object({
    confession_channel_id: cfg.channel({
      label: "Confession Channel",
      description: "Where anonymous confessions are posted.",
      channelTypes: [ChannelType.GuildText],
    }),
    log_channel_id: cfg.channel({
      label: "Moderator Log Channel",
      description:
        "Logs confessions with hashed author IDs (keeps them anonymous to moderators).",
      channelTypes: [ChannelType.GuildText],
    }),
    report_channel_id: cfg.channel({
      label: "Report Log Channel",
      description:
        "Where confession/reply reports submitted by users are sent.",
      channelTypes: [ChannelType.GuildText],
    }),
    report_ping_role_id: cfg.role({
      label: "Report Ping Role",
      description:
        "Optional role to ping in the report log channel when a new report is submitted.",
    }),
    media_channel_id: cfg.channel({
      label: "Media Re-hosting Channel",
      description:
        "Optional channel where the bot re-uploads images to generate permanent URLs.",
      channelTypes: [ChannelType.GuildText],
    }),
    auto_thread: cfg.boolean({
      label: "Auto-Thread",
      description: "Open a thread under each confession for anonymous replies.",
      default: true,
    }),
    allow_attachments: cfg.boolean({
      label: "Allow Image Attachments",
      description:
        "Allow users to upload images directly to their confessions and replies.",
      default: true,
    }),
    cooldown_minutes: cfg.number({
      label: "Cooldown (minutes)",
      description: "Minimum gap between confessions from the same author.",
      default: 5,
      min: 0,
      max: 1440,
    }),
  }),
})
export class ConfessionsModule extends Module {
  /**
   * GDPR erasure: drop this user's ban record, cooldown, authored confessions,
   * and reply-author rows in every guild. Author hashes are salted per guild, so
   * this must run guild-by-guild.
   */
  public override async deleteUserData(userId: string): Promise<void> {
    for (const guildId of this.container.client.guilds.cache.keys())
      await deleteForUser(guildId, userId);
  }
}
