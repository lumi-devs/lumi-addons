import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// Fires every 5 minutes; the handler applies the per-guild configured sweep
// interval itself (Redis last-sweep timestamp), so guilds can pick any cadence
// without re-registering the job.
@ApplyOptions<ScheduledTask.Options>({
  name: "promoter-sweep",
  interval: 300_000,
})
export class PromoterSweepTask extends ScheduledTask {
  public async run(): Promise<void> {
    await publishTaskFire("promoter-sweep", {});
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "promoter-sweep": Record<string, never>;
  }
}
