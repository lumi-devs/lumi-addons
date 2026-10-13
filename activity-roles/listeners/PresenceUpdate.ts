import { Events } from "discord.js";
import type { Presence } from "discord.js";
import { defineListener } from "@lumi-devs/lumi/listeners";
import type { Container } from "@lumi-devs/lumi/services";
import { MODULE_NAME } from "../utilities/Store.js";
import { activitiesFromPresence, converge } from "../utilities/Engine.js";

export const presenceUpdateListener = defineListener({
  name: "activityRolesPresenceUpdate",
  event: Events.PresenceUpdate,
  module: MODULE_NAME,
  guildId: (_old: Presence | null, newPresence: Presence) =>
    newPresence.guild?.id ?? null,
  async execute(
    services: Container,
    _old: Presence | null,
    newPresence: Presence,
  ): Promise<void> {
    const guild = newPresence.guild;
    if (!guild) return;
    if (newPresence.user?.bot) return;
    const member = newPresence.member ?? (await guild.members.fetch(newPresence.userId).catch(() => null));
    if (!member) return;
    await converge(services, {
      guild,
      member,
      activities: activitiesFromPresence(newPresence),
    }).catch((err: unknown) =>
      services.logger.error(
        `[ActivityRoles] Failed to update roles for ${newPresence.userId}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  },
});
