import { defineCommand, type CommandContext } from "lumi/commands";
import { makeInfoCard } from "lumi/ui";
import { getConfessionsConfig } from "../lib/config.js";
import { authorHashFor, isBanned, onCooldown } from "../lib/data.js";
import { buildConfessionModal, openFormRow } from "../lib/ui.js";

export default defineCommand({
  name: "confess",
  description: "Submit an anonymous confession.",
  build: () => ({ name: "confess", description: "Submit an anonymous confession." }),
  run: async (ctx: CommandContext) => {
    if (!ctx.guildId) {
      return ctx.replyError("Guild Only", "This command only works inside a server.");
    }
    const guildId = ctx.guildId;
    const config = await getConfessionsConfig(guildId);

    if (!config.channelId) {
      return ctx.replyWarning(
        "Not Configured",
        "An admin needs to configure the confession channel first.",
      );
    }

    const hash = await authorHashFor(guildId, ctx.user.id);
    if (await isBanned(guildId, hash)) {
      return ctx.replyError(
        "Blocked",
        "You can no longer submit confessions in this server.",
      );
    }

    if (await onCooldown(guildId, hash, config.cooldownMinutes)) {
      return ctx.replyWarning(
        "Slow Down",
        `Please wait before your next confession (cooldown: ${config.cooldownMinutes}m).`,
      );
    }

    if (!ctx.isSlash) {
      return ctx.reply(
        makeInfoCard(
          "🕊️ Anonymous Confession",
          "Press the button below to open the anonymous confession form.",
          { actionRows: [openFormRow()] },
        ),
      );
    }
    return ctx.showModal(buildConfessionModal(config.allowAttachments));
  },
});
