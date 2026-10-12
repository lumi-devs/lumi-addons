import type { Presence } from "discord.js";
import { ActivityType, Events } from "discord.js";
import { defineListener } from "@lumi-devs/lumi/lib/listeners/ListenerDef.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { MODULE_NAME } from "../utilities/Keys.js";
import { converge } from "../Index.js";
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

    const customStatus = newPresence.activities.find(
      (a) => a.type === ActivityType.Custom,
    );
    const statusText = customStatus?.state ?? "";
    const worn = wearsServerTag(newPresence.member?.user.primaryGuild ?? null, guildId);
    const roles = newPresence.member?.roles.cache.map((r) => r.id) ?? [];

    await converge(services, {
      guildId,
      userId: newPresence.userId,
      status: statusText,
      worn,
      roles,
    });
  },
});
