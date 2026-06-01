import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { liftBlock } from "../lib/protection.js";

export interface RoleBlockExpirePayload {
  guildId: string;
  roleId: string;
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "rolementions-expire": RoleBlockExpirePayload;
  }
}

@ApplyOptions<ScheduledTask.Options>({ name: "rolementions-expire" })
export class RoleBlockExpireTask extends ScheduledTask<"rolementions-expire"> {
  public async run(payload: RoleBlockExpirePayload): Promise<void> {
    const guild = this.container.client.guilds.cache.get(payload.guildId);
    // Guild gone (kicked) — the block dies with it; nothing to clean up here.
    if (!guild) return;

    // Idempotent: liftBlock no-ops if the block was already removed manually.
    await liftBlock(guild, payload.roleId, "expired");
  }
}
