import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// One-shot background job for the admin "sweep all prior threads" action. It's
// enqueued with no delay from the confirmation button; the Discord-touching work
// (iterating every active + archived thread) lives in `handleThreadSweepFire`.
export interface ThreadSweepPayload {
  guildId: string;
  /** Channel to post the summary card back to. */
  channelId: string;
  requesterId: string;
  minMessages: number;
  scope: "all" | "enabled";
  stripMembers: boolean;
}

@ApplyOptions<ScheduledTask.Options>({ name: "thread-cleaner-sweep" })
export class ThreadSweepTask extends ScheduledTask<"thread-cleaner-sweep"> {
  public async run(payload: ThreadSweepPayload): Promise<void> {
    await publishTaskFire("thread-cleaner-sweep", payload);
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "thread-cleaner-sweep": ThreadSweepPayload;
  }
}
