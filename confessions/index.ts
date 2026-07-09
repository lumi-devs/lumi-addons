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
      label: "Moderation Log",
      description:
        "Optional channel for ban / delete audit entries (never reveals authors).",
      channelTypes: [ChannelType.GuildText],
    }),
    auto_thread: cfg.boolean({
      label: "Auto-Thread",
      description: "Open a thread under each confession for anonymous replies.",
      default: true,
    }),
    allow_attachments: cfg.boolean({
      label: "Allow Image URLs",
      description:
        "Let submitters attach an image URL to confessions and replies.",
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
