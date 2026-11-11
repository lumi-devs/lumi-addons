import type {
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import { Events, type Presence } from "discord.js";
import { ModuleName } from "../data.js";
import { activitiesFromPresence } from "../logic.js";
import { reconcileMember } from "../runtime.js";

export const presenceUpdateListener: ListenerDefinition = {
  event: Events.PresenceUpdate,
  async handler(
    _oldPresence: Presence | null,
    newPresence: Presence,
    services: ModuleServices,
  ): Promise<void> {
    const guild = newPresence.guild;
    if (!guild) return;
    if (!services.modules.isEnabled(guild.id, ModuleName)) return;
    const user = newPresence.user ?? newPresence.member?.user;
    if (user?.bot) return;
    const member =
      newPresence.member ??
      (await guild.members.fetch(newPresence.userId).catch(() => null));
    if (!member) return;
    try {
      await reconcileMember(
        services,
        guild,
        member,
        activitiesFromPresence(newPresence),
      );
    } catch (error) {
      services.observability.logger.warn("activity role presence update failed", {
        guildId: guild.id,
        userId: newPresence.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
