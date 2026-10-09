import type { InteractionContext } from "lumi/interactions";
import { members } from "lumi/discord";
import { getRole, removeShare } from "../lib/data.js";
import { IDS, PREFIX_SELECTS } from "../lib/ui.js";

export default {
  prefix: PREFIX_SELECTS,
  run: async (ctx: InteractionContext) => {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This only works inside a server.");
    if (ctx.customId !== IDS.unshareSelect) return undefined;

    const guildId = ctx.guildId;
    const target = ctx.values[0];
    if (!target) return undefined;

    const role = await getRole(guildId, ctx.user.id);
    if (!role) return ctx.replyError("Gone", "You no longer have a custom role.");

    if (await removeShare(guildId, ctx.user.id, target)) {
      await members.removeRole(guildId, target, role.roleId).catch(() => {});
    }

    return ctx.replySuccess("Updated", `<@${target}> no longer has your role.`);
  },
};
