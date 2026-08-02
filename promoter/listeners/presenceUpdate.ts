import { ApplyOptions } from "@sapphire/decorators";
import { Events } from "@sapphire/framework";
import type { Presence } from "discord.js";
import { ModuleListener } from "#core/module-system/ModuleListener.js";
import { MODULE_NAME } from "../keys.js";
import { evaluateMember } from "../lib/evaluate.js";

@ApplyOptions<ModuleListener.Options>({
  module: MODULE_NAME,
  event: Events.PresenceUpdate,
})
export class PromoterPresenceListener extends ModuleListener<"presenceUpdate"> {
  // First arg is `oldPresence` and may be null; the guild lives on newPresence.
  protected override resolveGuildId(
    _old: Presence | null,
    newPresence: Presence,
  ): string | null {
    return newPresence.guild?.id ?? null;
  }

  protected async handle(
    _old: Presence | null,
    newPresence: Presence,
  ): Promise<void> {
    const { member } = newPresence;
    if (!member) return;
    await evaluateMember(member).catch((err) => {
      this.container.logger.warn(
        `[Promoter] evaluate failed for ${member.id} in ${member.guild.id}:`,
        err,
      );
    });
  }
}
