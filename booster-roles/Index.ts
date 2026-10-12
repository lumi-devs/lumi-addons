import { ChannelType } from "discord.js";
import { defineModule } from "@lumi-devs/lumi/module";
import { cfg } from "@lumi-devs/lumi/config";
import type { Container } from "@lumi-devs/lumi/services";
import { BoosterKeys, MODULE_NAME } from "./utilities/Keys.js";
import { handleGraceExpire } from "./tasks/GraceExpireFire.js";

export const boosterRolesModule = defineModule({
  name: MODULE_NAME,
  displayName: "Booster Roles",
  emoji: "🎨",
  version: "1.0.0",
  description:
    "Personal custom roles for server boosters — create, recolor, and share a role through an interactive panel, with automatic cleanup (grace period) when a boost lapses, a moderator admin panel, and a blacklist.",
  short: "Custom roles for boosters.",
  endUserDataStatement:
    "Stores custom booster role definitions (role ID, owner user ID, role name, hex color, and optional shared user IDs) in guild configuration storage for managing server booster perks. Data is deleted upon role deletion or GDPR user purge request.",
  author: ["Antigravity"],
  min_bot_version: "0.6.0",
  category: "Community",
  disableable: true,
  configSchema: cfg.object({
    booster_role_ids: cfg.string({
      label: "Qualifying Roles",
      description:
        "Comma-separated role IDs that grant custom-role access. Leave empty to use native server-boost status.",
    }),
    anchor_role_id: cfg.role({
      label: "Anchor Role",
      description:
        "Legacy anchor role; new roles are no longer positioned under it. Kept so existing settings are not lost.",
    }),
    showcase_channel_id: cfg.channel({
      label: "Showcase Channel",
      description: "Optional channel that announces newly created roles.",
      channelTypes: [ChannelType.GuildText],
    }),
    log_channel_id: cfg.channel({
      label: "Moderation Log",
      description: "Optional channel for deletion / cleanup audit entries.",
      channelTypes: [ChannelType.GuildText],
    }),
    max_shares: cfg.number({
      label: "Max Shares",
      description: "How many other members an owner may share their role with.",
      default: 3,
      min: 0,
      max: 25,
    }),
    grace_hours: cfg.number({
      label: "Grace Period (hours)",
      description:
        "How long to keep a role after its owner stops boosting before deleting it.",
      default: 24,
      min: 0,
      max: 720,
    }),
    name_max_length: cfg.number({
      label: "Max Name Length",
      description: "Maximum length for custom role names.",
      default: 32,
      min: 2,
      max: 100,
    }),
  }),

  async onLoad(_services: Container): Promise<void> {},

  async onUnload(_services: Container): Promise<void> {},

  async deleteUserData(services: Container, userId: string): Promise<void> {
    await services.db.guildKV.deleteModuleDataForTarget(MODULE_NAME, userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await services.db.guildKV.listModuleDataForTarget(MODULE_NAME, userId);
    if (rows.length === 0) return null;
    const roleRows = rows.filter((r) => r.key === BoosterKeys.ROLE);
    const blacklistRows = rows.filter((r) => r.key === BoosterKeys.BLACKLIST);
    const graceRows = rows.filter((r) => r.key === BoosterKeys.GRACE);
    return {
      roles: roleRows.map((r) => r.value),
      blacklists: blacklistRows.map((r) => r.value),
      gracePeriods: graceRows.map((r) => r.value),
    };
  },
});

export const oneshots = {
  "grace-expire": handleGraceExpire,
};

export default boosterRolesModule;
