import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { Emojis } from "#utilities/assets.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handleThreadCleanerFire } from "./lib/cleanup-handler.js";
import { handleThreadSweepFire } from "./lib/sweep-handler.js";

@DefineModule({
  name: "thread-cleaner",
  displayName: "Thread Cleaner",
  emoji: Emojis.CLEANUP,
  version: "1.0.0",
  description:
    "Automatically archives/locks threads after inactivity, plus an admin bulk sweep of all existing threads.",
  configSchema: cfg.object({
    enabled_channels: cfg.string({
      label: "Enabled Channels",
      description:
        "A comma-separated list of channel IDs where new threads should be tracked.",
      list: true,
    }),
    inactive_duration: cfg.string({
      label: "Inactivity Duration",
      description:
        "The duration of inactivity before a thread is archived (e.g., '24h', '3d', '1w').",
      default: "3d",
    }),
    action: cfg.enum(["archive", "lock"], {
      label: "Cleanup Action",
      description: "The action to perform on the thread after the duration.",
      default: "archive",
    }),
  }),
})
export class ThreadCleanerModule extends Module {
  public override onLoad() {
    registerTaskFireHandler(
      "thread-cleaner-task",
      "unicast",
      handleThreadCleanerFire,
    );
    // Broadcast: the sweep iterates guilds.cache, so only the worker holding the
    // guild acts.
    registerTaskFireHandler(
      "thread-cleaner-sweep",
      "broadcast",
      handleThreadSweepFire,
    );
    return super.onLoad();
  }

  public override onUnload() {
    this.container.logger.info("[ThreadCleanerModule] Unloaded Thread Cleaner task handlers.");
    return super.onUnload();
  }
}
