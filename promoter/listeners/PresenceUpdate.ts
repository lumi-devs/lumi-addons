import type { Presence } from "discord.js";
import { ActivityType, Events } from "discord.js";
import { defineListener } from "@lumi-devs/lumi/listeners";
import type { Container } from "@lumi-devs/lumi/services";
import { MODULE_NAME } from "../utilities/Keys.js";
import { converge } from "../utilities/Engine.js";
import { wearsServerTag } from "../utilities/Matching.js";

export const presenceUpdateListener = defineListener<[Presence | null, Presence]>({
  name: "promoterPresenceUpdate",
  event: Events.PresenceUpdate,
  module: MODULE_NAME,
  guildId: (_old, newP) => newP.guild?.id ?? null,
  async execute(services: Container, _old, newPresence) {
    const guildId = newPresence.guild?.id;
    if (!guildId) return;
    if (newPresence.user?.bot) return;

    const member = await newPresence.guild?.members.fetch(newPresence.userId).catch(() => newPresence.member ?? null);
    const customStatus = newPresence.activities.find(
      (a) => a.type === ActivityType.Custom,
    );
    const statusText = customStatus?.state ?? "";
    const worn = wearsServerTag(member?.user.primaryGuild ?? null, guildId);
    const roles = member ? [...member.roles.cache.keys()] : [];

    await converge(services, {
      guildId,
      userId: newPresence.userId,
      status: statusText,
      worn,
      roles,
    });
  },
});
