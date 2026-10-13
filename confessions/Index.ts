import { ChannelType } from "discord.js";
import { defineModule } from "@lumi-devs/lumi/module";
import { cfg } from "@lumi-devs/lumi/config";
import type { Container } from "@lumi-devs/lumi/services";
import { MODULE_NAME } from "./utilities/Keys.js";
import { deleteAuthorRowsForUser, exportAuthorRowsForUser } from "./utilities/Data.js";

export const confessionsModule = defineModule({
  name: MODULE_NAME,
  displayName: "Confessions",
  emoji: "🕊️",
  version: "1.0.0",
  description:
    "Anonymous confessions posted through /confess, with optional anonymous replies, per-author cooldowns, and moderator bans - identities are never stored in the clear.",
  short: "Anonymous confessions + replies.",
  endUserDataStatement:
    "Stores cryptographic one-way hashes of author IDs per guild for moderation, plus sealed author links so reply notifications can reach you, and your notification opt-out choice. All of it is removed by GDPR deletion.",
  category: "Community",
  author: ["Antigravity"],
  min_bot_version: "0.6.0",
  configSchema: cfg.object({
    confession_channel_id: cfg.channel({
      label: "Confession Channel",
      description: "Where anonymous confessions are posted.",
      channelTypes: [ChannelType.GuildText],
    }),
    log_channel_id: cfg.channel({
      label: "Moderator Log Channel",
      description: "Logs confessions with hashed author IDs for moderation audit.",
      channelTypes: [ChannelType.GuildText],
    }),
    report_channel_id: cfg.channel({
      label: "Report Log Channel",
      description: "Where confession and reply reports submitted by users are sent.",
      channelTypes: [ChannelType.GuildText],
    }),
    report_ping_role_id: cfg.role({
      label: "Report Ping Role",
      description: "Optional role to ping in the report log channel when a new report is submitted.",
    }),
    auto_thread: cfg.boolean({
      label: "Auto-Thread",
      description: "Open a discussion thread on each confession; replies are posted inside it.",
      default: true,
    }),
    allow_attachments: cfg.boolean({
      label: "Allow Image Attachments",
      description: "Allow users to attach an image URL to their confessions and replies.",
      default: true,
    }),
    cooldown_minutes: cfg.number({
      label: "Cooldown (minutes)",
      description: "Minimum gap between confessions from the same author.",
      default: 5,
      min: 0,
      max: 1440,
    }),
    reply_dm_notifications: cfg.boolean({
      label: "Reply DM Notifications",
      description: "DM authors when someone replies to their confession or reply. Users can stop these from the DM itself.",
      default: true,
    }),
  }),

  async deleteUserData(services: Container, userId: string): Promise<void> {
    await deleteAuthorRowsForUser(services, userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await services.db.guildKV.listModuleDataForTarget(MODULE_NAME, userId);
    const records = rows.map((row) => ({ guildId: row.guildId, key: row.key, value: row.value }));
    for (const r of await exportAuthorRowsForUser(services, userId)) records.push(r);
    if (records.length === 0) return null;
    return { records };
  },
});
