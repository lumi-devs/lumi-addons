import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handleLoungeReconcileFire } from "./lib/reconcile-handler.js";

@DefineModule({
  name: "multi-lounge",
  displayName: "Multi Lounge",
  emoji: "🛋️",
  version: "1.0.0",
  description:
    "Auto-scaling voice lounges — clones a base channel when every lounge is busy and removes the extras when they empty.",
  configSchema: cfg.object({
    base_channel_ids: cfg.string({
      label: "Base Lounges",
      description:
        "Comma-separated voice channel IDs. Each scales its own group independently.",
      list: true,
    }),
    busy_threshold: cfg.number({
      label: "Busy Threshold",
      description:
        "Users in a lounge before it counts as busy. New lounges appear once every lounge in a group is busy.",
      default: 2,
      min: 1,
      max: 99,
    }),
    max_extra_lounges: cfg.number({
      label: "Max Extra Lounges",
      description:
        "Upper limit on bot-created lounges per base (the base is always kept).",
      default: 5,
      min: 1,
      max: 25,
    }),
    name_template: cfg.string({
      label: "Name Template",
      description: "Name for created lounges; {n} is the lounge number.",
      default: "Lounge {n}",
    }),
    cooldown_seconds: cfg.number({
      label: "Creation Cooldown (seconds)",
      description: "Minimum gap between creating lounges, to avoid churn.",
      default: 10,
      min: 0,
      max: 300,
    }),
  }),
})
export class MultiLoungeModule extends Module {
  public override onLoad() {
    registerTaskFireHandler(
      "multi-lounge-reconcile",
      "broadcast",
      handleLoungeReconcileFire,
    );
    return super.onLoad();
  }

  // No deleteUserData override: the addon stores only channel IDs and aggregate
  // counters — no data keyed by a user ID.
}
