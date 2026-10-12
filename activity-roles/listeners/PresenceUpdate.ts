import { Events } from "discord.js";
import type { Presence } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
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
    const member = newPresence.member ?? await newPresence.guild?.members.fetch(userId).catch(() => null);
    const roles = member ? rolesFromMember(member) : [];
    await convergeMember(services, guildId, userId, { activities, roles });
  },
});
