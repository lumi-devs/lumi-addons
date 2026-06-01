import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { ChannelType } from "discord.js";
import { Emojis } from "#utilities/assets.js";

@DefineModule({
  name: "rolementions",
  displayName: "Role Mentions",
  emoji: Emojis.SHIELD,
  version: "1.0.0",
  description:
    "Tracks role mentions with daily stats and auto-protects sensitive roles from mention spam via Discord AutoMod rules.",
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description:
        "Channel where mention activity and protection events are logged.",
      channelTypes: [ChannelType.GuildText],
    }),
    auto_protect: cfg.boolean({
      label: "Auto-Protect",
      description:
        "Automatically block mentions of protected roles when they are pinged.",
      default: true,
    }),
    default_duration: cfg.number({
      label: "Default Protection (minutes)",
      description:
        "Fallback protection duration, in minutes, when a protected role has none set.",
      default: 120,
    }),
  }),
})
export class RoleMentionsModule extends Module {
  public override async deleteUserData(
    _userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // No per-user data: counters and blocks are keyed by role, not user.
  }
}
