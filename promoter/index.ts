import { ChannelType } from "discord.js";
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handlePromoterSweepFire } from "./lib/sweep-handler.js";

@DefineModule({
  name: "promoter",
  displayName: "Promoter",
  emoji: "📣",
  version: "1.0.0",
  description:
    "Auto-role for members advertising the server in their custom status.",
  configSchema: cfg.object({
    promoter_role_id: cfg.role({
      label: "Promoter Role",
      description:
        "Role granted while a member's status advertises the server.",
    }),
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel for grant/revoke event cards.",
      channelTypes: [ChannelType.GuildText],
    }),
    match_terms: cfg.string({
      label: "Match Terms",
      description:
        'Comma-separated invite slugs / tags to look for in statuses, e.g. ".gg/lumi, LUMI".',
      list: true,
    }),
    sweep_interval_minutes: cfg.number({
      label: "Sweep Interval (minutes)",
      description: "How often the self-heal sweep re-checks members.",
      default: 30,
      min: 5,
      max: 1440,
    }),
  }),
})
export class PromoterModule extends Module {
  public override onLoad() {
    registerTaskFireHandler(
      "promoter-sweep",
      "broadcast",
      handlePromoterSweepFire,
    );
    return super.onLoad();
  }
  // No deleteUserData override: the addon stores only aggregate counters —
  // no per-user rows.
}
