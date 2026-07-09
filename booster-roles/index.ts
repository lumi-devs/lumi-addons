import { ChannelType } from "discord.js";
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { deleteForUser } from "./lib/data.js";
import { handleBoosterGraceFire } from "./lib/grace-handler.js";
import { handleBoosterReconcileFire } from "./lib/reconcile-handler.js";

@DefineModule({
  name: "booster-roles",
  displayName: "Booster Roles",
  emoji: "🎨",
  version: "1.0.0",
  description:
    "Personal custom roles for server boosters — an interactive create/recolour/share panel, moderator admin tools, a blacklist, and automatic grace-period cleanup when a boost lapses.",
  configSchema: cfg.object({
    booster_role_ids: cfg.string({
      label: "Qualifying Roles",
      description:
        "Comma-separated role IDs that grant custom-role access. Leave empty to use native server-boost status.",
      list: true,
    }),
    anchor_role_id: cfg.role({
      label: "Anchor Role",
      description: "Created roles are positioned just below this role.",
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
})
export class BoosterRolesModule extends Module {
  public override onLoad() {
    // Broadcast: every worker checks its own guilds.cache and only the holder
    // acts (grace) / all sweep their own guilds (reconcile).
    registerTaskFireHandler(
      "booster-grace-delete",
      "broadcast",
      handleBoosterGraceFire,
    );
    registerTaskFireHandler(
      "booster-roles-reconcile",
      "broadcast",
      handleBoosterReconcileFire,
    );
    return super.onLoad();
  }

  /** GDPR erasure: drop this user's role, blacklist entry, and shares everywhere. */
  public override async deleteUserData(userId: string): Promise<void> {
    for (const guildId of this.container.client.guilds.cache.keys())
      await deleteForUser(guildId, userId);
  }
}
