import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "lumi/scheduling";

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
