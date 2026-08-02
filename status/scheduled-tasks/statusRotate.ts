import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// Fires every 60s; the handler applies the *configured* interval itself via a
// Redis rotated-at timestamp, so changing `/status interval` needs no job
// re-registration.
@ApplyOptions<ScheduledTask.Options>({
  name: "status-rotate",
  interval: 60_000,
})
export class StatusRotateTask extends ScheduledTask {
  public async run(): Promise<void> {
    await publishTaskFire("status-rotate", {});
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "status-rotate": Record<string, never>;
  }
}
