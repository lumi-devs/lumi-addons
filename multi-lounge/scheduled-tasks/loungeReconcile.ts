import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// Every 5 minutes: heal registry drift (channels deleted out-of-band, orphaned
// empty extras) and settle each guild's lounge count. Broadcast so every worker
// iterates its own guilds.cache.
@ApplyOptions<ScheduledTask.Options>({
  name: "multi-lounge-reconcile",
  interval: 300_000,
})
export class LoungeReconcileTask extends ScheduledTask {
  public async run(): Promise<void> {
    await publishTaskFire("multi-lounge-reconcile", {});
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "multi-lounge-reconcile": Record<string, never>;
  }
}
