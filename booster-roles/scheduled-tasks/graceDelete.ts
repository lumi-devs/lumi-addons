import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { RelayTask, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";

// One-shot boost-loss cleanup. `catchUp` is left at its default (true): if the
// bot was down when the grace elapsed, the role should still be removed on the
// next boot. The fire handler re-checks eligibility, so a re-boost is respected.
export interface BoosterGracePayload extends CatchUpMeta {
  guildId: string;
  ownerId: string;
}

@ApplyOptions<ScheduledTask.Options>({ name: "booster-grace-delete" })
export class BoosterGraceTask extends RelayTask<"booster-grace-delete"> {}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "booster-grace-delete": BoosterGracePayload;
  }
}
