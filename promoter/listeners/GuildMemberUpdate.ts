import { Events, type GuildMember, type PartialGuildMember } from "discord.js";
import { defineListener } from "@lumi-devs/lumi/listeners";
import type { Container } from "@lumi-devs/lumi/services";
import { MODULE_NAME } from "../utilities/Keys.js";
import { converge } from "../utilities/Engine.js";
import { wearsServerTag } from "../utilities/Matching.js";

export const promoterMemberUpdateListener = defineListener<[GuildMember | PartialGuildMember, GuildMember]>({
  name: "promoterMemberUpdate",
  event: Events.GuildMemberUpdate,
  module: MODULE_NAME,
  guildId: (_old, member) => member.guild.id,
  async execute(services: Container, oldMember, member) {
    if (member.user.bot) return;
    const guildId = member.guild.id;

    const oldWorn = wearsServerTag(oldMember.user?.primaryGuild ?? null, guildId);
    const newWorn = wearsServerTag(member.user.primaryGuild ?? null, guildId);

    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(member.roles.cache.keys());
    let rolesChanged = false;
    for (const r of oldRoles) {
      if (!newRoles.has(r)) { rolesChanged = true; break; }
    }
    if (!rolesChanged) {
      for (const r of newRoles) {
        if (!oldRoles.has(r)) { rolesChanged = true; break; }
      }
    }

    if (oldWorn === newWorn && !rolesChanged) return;

    const roles = [...member.roles.cache.keys()];
    await converge(services, {
      guildId,
      userId: member.id,
      worn: newWorn,
      roles,
    });
  },
});

export default promoterMemberUpdateListener;
