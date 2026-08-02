import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { shouldRunNow, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";
import { publishTaskFire } from "#lib/scheduler-bus.js";

export interface DragmeRevokePayload extends CatchUpMeta {
  guildId: string;
  userId: string;
  channelId: string;
}

@ApplyOptions<ScheduledTask.Options>({ name: "dragme-revoke" })
export class DragmeRevokeTask extends ScheduledTask<"dragme-revoke"> {
  public async run(payload: DragmeRevokePayload): Promise<void> {
    if (!shouldRunNow("dragme-revoke", payload)) return;
    await publishTaskFire("dragme-revoke", payload);
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "dragme-revoke": DragmeRevokePayload;
  }
}
