import { Events } from "discord.js";
import type { Presence } from "discord.js";
import { defineListener } from "@lumi-devs/lumi/listeners";
import type { Container } from "@lumi-devs/lumi/services";
import { MODULE_NAME } from "../utilities/Store.js";
import {
  activitiesFromPresence,
  convergeMember,
  rolesFromMember,
} from "../utilities/Converge.js";

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
    const guildId = newPresence.guild?.id;
    if (!guildId) return;
    const userId = newPresence.userId;
    const activities = activitiesFromPresence(newPresence);
    const member = await newPresence.guild?.members
      .fetch({ user: userId, withPresences: true })
      .catch(() => newPresence.member ?? null);
    const roles = member ? rolesFromMember(member) : [];
    await convergeMember(services, guildId, userId, { activities, roles }).catch((err: unknown) =>
      services.logger.error(
        `[ActivityRoles] Failed to update roles for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  },
});
