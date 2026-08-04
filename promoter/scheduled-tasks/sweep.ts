import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "lumi/scheduling";

// Self-heal sweep: catches drift that never fires a `presenceUpdate`, most
// notably a member turning the native server tag on/off (that's on the user
// object, not presence). Base cadence matches the shortest configurable
// `sweep_interval_minutes` (5m); the handler throttles each guild individually
// against its own configured interval via `PromoterKeys.lastSweep`, so a
// shorter global tick just means longer-interval guilds get checked-and-skipped
// more often, not swept more often than they asked for.
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
