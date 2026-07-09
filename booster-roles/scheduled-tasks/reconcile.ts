import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// Every 12 hours: heal drift — remove records whose owner left, whose Discord
// role was deleted out-of-band, or whose boost lapsed while the bot was down and
// no grace job survived. Broadcast so each worker sweeps its own guilds.cache.
@ApplyOptions<ScheduledTask.Options>({
  name: "booster-roles-reconcile",
  interval: 43_200_000,
})
export class BoosterReconcileTask extends ScheduledTask {
  public async run(): Promise<void> {
    await publishTaskFire("booster-roles-reconcile", {});
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "booster-roles-reconcile": Record<string, never>;
  }
}
