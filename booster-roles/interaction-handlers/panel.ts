import type { InteractionContext } from "lumi/interactions";
import { getBoosterConfig } from "../lib/config.js";
import { deleteBoosterRole, getRole } from "../lib/data.js";
import { accessDenial } from "../lib/access.js";
import {
  IDS,
  PREFIX_BUTTONS,
  buildColorModal,
  buildDeleteConfirm,
  buildNameModal,
  buildShareModal,
  buildUnsharePrompt,
} from "../lib/ui.js";

export default {
  prefix: PREFIX_BUTTONS,
  run: async (ctx: InteractionContext) => {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This only works inside a server.");
    const guildId = ctx.guildId;
    const config = await getBoosterConfig(guildId);

    if (ctx.customId === IDS.create) {
      const denial = await accessDenial(guildId, ctx.user.id, config);
      if (denial) return ctx.replyError("Error", denial);
      if (await getRole(guildId, ctx.user.id)) return ctx.replyError("Error", "You already have a custom role.");
      return ctx.showModal(buildNameModal("create", config.nameMaxLength));
    }

    const role = await getRole(guildId, ctx.user.id);
    if (!role) return ctx.replyError("Error", "You don't have a custom role anymore.");

    switch (ctx.customId) {
      case IDS.rename:
        return ctx.showModal(buildNameModal("rename", config.nameMaxLength, role.name));
      case IDS.recolor:
        return ctx.showModal(buildColorModal(role.color ?? undefined));
      case IDS.share:
        if (role.sharedWith.length >= config.maxShares) {
          return ctx.replyError("Can't Share", `You can share with at most ${config.maxShares} member(s).`);
        }
        return ctx.showModal(buildShareModal());
      case IDS.shares:
        return ctx.reply(buildUnsharePrompt(role.sharedWith));
      case IDS.delete:
        return ctx.reply(buildDeleteConfirm(role));
      case IDS.deleteConfirm:
        await deleteBoosterRole(guildId, role, config, "deleted by the owner");
        return ctx.replySuccess("Deleted", "Your custom role has been removed.");
      default:
        return undefined;
    }
  },
};
