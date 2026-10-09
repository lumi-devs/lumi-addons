import { cfg, defineModule } from "lumi";

export const meta = defineModule({
  name: "confessions",
  displayName: "Confessions",
  emoji: "🕊️",
  version: "1.0.0",
  description:
    "Anonymous confessions posted through /confess, with optional anonymous replies, per-author cooldowns, and moderator bans — identities are never stored in the clear.",
  short: "Anonymous confessions + replies.",
  endUserDataStatement:
    "Stores cryptographic one-way hashes of author IDs per guild for moderation purposes (banning abusers, managing replies) without storing plaintext user identities. Author mappings can be purged via GDPR deletion.",
  configSchema: cfg.object({
    confession_channel_id: cfg.channel({
      label: "Confession Channel",
      description: "Where anonymous confessions are posted.",
      channelTypes: [0],
    }),
    log_channel_id: cfg.channel({
      label: "Moderator Log Channel",
      description:
        "Logs confessions with hashed author IDs for moderation audit.",
      channelTypes: [0],
    }),
    report_channel_id: cfg.channel({
      label: "Report Log Channel",
      description:
        "Where confession and reply reports submitted by users are sent.",
      channelTypes: [0],
    }),
    report_ping_role_id: cfg.role({
      label: "Report Ping Role",
      description:
        "Optional role to ping in the report log channel when a new report is submitted.",
    }),
    auto_thread: cfg.boolean({
      label: "Auto-Thread",
      description:
        "Open a discussion thread on each confession; replies are posted inside it.",
      default: true,
    }),
    allow_attachments: cfg.boolean({
      label: "Allow Image Attachments",
      description:
        "Allow users to attach an image URL to their confessions and replies.",
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
});
