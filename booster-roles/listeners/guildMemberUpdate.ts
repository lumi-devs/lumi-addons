import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember, PartialGuildMember } from "discord.js";
import { ModuleListener } from "#core/module-system/ModuleListener.js";
import { scheduleTask, cancelTask } from "#lib/schedule-task.js";
import { MODULE_NAME, graceJobId } from "../keys.js";
import { getBoosterConfig } from "../lib/config.js";
import { getRole } from "../lib/data.js";
import { isEligible } from "../lib/roles.js";
import { handleBoosterGraceFire } from "../lib/grace-handler.js";

// React to boost gain/loss. We key off the member's *current* eligibility rather
// than diffing the (possibly partial) old member: eligible → cancel any pending
// grace deletion; ineligible with a role → arm one. The stable jobId makes
// re-arming idempotent.
@ApplyOptions<ModuleListener.Options>({
  event: "guildMemberUpdate",
  module: MODULE_NAME,
})
export class BoosterMemberUpdateListener extends ModuleListener<"guildMemberUpdate"> {
  protected override resolveGuildId(
    _old: GuildMember | PartialGuildMember,
    next: GuildMember,
  ): string | null {
    return next.guild?.id ?? null;
  }

  protected async handle(
    _old: GuildMember | PartialGuildMember,
    member: GuildMember,
  ): Promise<void> {
    const guildId = member.guild.id;
    const record = await getRole(guildId, member.id);
    if (!record) return;

    const config = await getBoosterConfig(guildId);
    const jobId = graceJobId(guildId, member.id);

    if (isEligible(member, config)) {
      await cancelTask(jobId).catch(() => null);
      return;
    }

    if (config.graceHours <= 0) {
      await handleBoosterGraceFire({ guildId, ownerId: member.id });
      return;
    }

    const delay = config.graceHours * 3_600_000;
    await scheduleTask(
      "booster-grace-delete",
      { guildId, ownerId: member.id, scheduledFor: Date.now() + delay },
      {
        delay,
        customJobOptions: {
          jobId,
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    );
  }
}
