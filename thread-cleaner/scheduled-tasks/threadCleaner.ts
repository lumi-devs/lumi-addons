import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { shouldRunNow, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// One delayed job per tracked thread, scheduled at creation to fire exactly
// when the thread's inactivity window elapses (jobId = thread-cleaner:<id>).
// Archiving a stale thread late — e.g. after downtime — is still correct, so
// this leaves `catchUp` at its default of `true`.
export interface ThreadCleanerPayload extends CatchUpMeta {
  threadId: string;
  guildId: string;
}

@ApplyOptions<ScheduledTask.Options>({ name: "thread-cleaner-task" })
export class ThreadCleanerTask extends ScheduledTask<"thread-cleaner-task"> {
  // Scheduler-side: relay the fire onto the bus. The Discord-touching work
  // lives in `handleThreadCleanerFire` (thread-cleaner/lib/cleanup-handler.ts),
  // registered on worker/monolith roles via `registerTaskFireHandler`.
  public async run(payload: ThreadCleanerPayload): Promise<void> {
    if (!shouldRunNow("thread-cleaner-task", payload)) return;
    await publishTaskFire("thread-cleaner-task", payload);
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "thread-cleaner-task": ThreadCleanerPayload;
  }
}
