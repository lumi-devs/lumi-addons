import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import type { GuildMember, PartialGuildMember } from "discord.js";
import { ModuleName } from "../config.js";
import {
  getRoleById,
  getUserRoleIndex,
  removeSharedRole,
} from "../data.js";
import { fetchRole, removeShareFromRole } from "../roles.js";

const memberRemoveListener: ListenerDefinition = {
  event: "guildMemberRemove",
  async handler(
    member: GuildMember | PartialGuildMember,
    services: ModuleServices,
  ) {
    const guild = member.guild;
    if (!services.modules.isEnabled(guild.id, ModuleName)) return;

    const index = await getUserRoleIndex(services, guild.id, member.id);
    for (const roleId of index.shared) {
      const record = await getRoleById(services, guild.id, roleId);
      if (!record) {
        await removeSharedRole(services, guild.id, member.id, roleId);
        continue;
      }
      const role = await fetchRole(guild, roleId);
      await removeShareFromRole(
        services,
        guild.id,
        record,
        member.id,
        role,
      );
    }
  },
};

export default memberRemoveListener;
