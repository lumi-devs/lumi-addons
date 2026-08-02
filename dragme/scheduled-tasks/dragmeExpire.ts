import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { shouldRunNow, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";
import { publishTaskFire } from "#lib/scheduler-bus.js";

export interface DragmeExpirePayload extends CatchUpMeta {
  guildId: string;
  userId: string;
}

@ApplyOptions<ScheduledTask.Options>({ name: "dragme-expire" })
export class DragmeExpireTask extends ScheduledTask<"dragme-expire"> {
  public async run(payload: DragmeExpirePayload): Promise<void> {
    if (!shouldRunNow("dragme-expire", payload)) return;
    await publishTaskFire("dragme-expire", payload);
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "dragme-expire": DragmeExpirePayload;
  }
}
