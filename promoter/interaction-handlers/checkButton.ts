import type { InteractionContext } from "lumi/interactions";
import { guilds, modules } from "lumi/discord";
import { MODULE_NAME } from "../keys.js";
import { converge, getPromoterConfig, getState } from "../lib/evaluate.js";
import { wearsServerTag } from "../lib/matching.js";

export default {
  prefix: "promoter:",
  run: async (ctx: InteractionContext) => {
    if (!ctx.guildId) {
      return ctx.replyError("Guild Only", "This only works inside a server.");
    }
    const guildId = ctx.guildId;
    const enabled = await modules.enabled(guildId, [MODULE_NAME]);
    if (!enabled[MODULE_NAME]) {
      return ctx.replyError(
        "Disabled",
        "The promoter module is disabled here.",
      );
    }

    const cfg = await getPromoterConfig(guildId);
    if (!cfg.roleId || cfg.matchTerms.length === 0) {
      return ctx.replyError(
        "Not Configured",
        "This server hasn't finished configuring the promoter module.",
      );
    }

    const member = await guilds
      .fetchMember(guildId, ctx.user.id)
      .catch(() => null);
    const roles = member?.roles ?? ctx.member?.roles ?? [];
    const state = await getState(guildId, ctx.user.id);
    const result = await converge({
      guildId,
      userId: ctx.user.id,
      status: state?.status ?? "",
      worn: wearsServerTag(member?.primaryGuild ?? null, guildId),
      roles,
    });

    if (result === "granted") {
      return ctx.replySuccess(
        "Role Granted",
        "Thanks for promoting the server — enjoy the role!",
      );
    }
    if (result === "revoked") {
      return ctx.replyWarning(
        "Role Removed",
        "You're no longer advertising the server, so the role was removed. Put the invite back to earn it again.",
      );
    }
    if (result === "holding") {
      return ctx.replySuccess(
        "Role Active",
        "You're advertising the server — the role is yours.",
      );
    }
    return ctx.replyInfo(
      "No Change",
      "Nothing to update. Put the server invite in your **custom status** or wear the server tag to earn the role.",
    );
  },
};
