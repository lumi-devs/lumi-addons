import {
  type CommandContext,
  type CommandDef,
} from "@lumi-devs/lumi/commands";
import { SlashCommandBuilder } from "discord.js";
import { makeInfoCard } from "@lumi-devs/lumi/ui";
import { getConfessionsConfig } from "../utilities/Config.js";
import { authorHashFor, isBanned, onCooldown } from "../utilities/Data.js";
import { buildConfessionModal, openFormRow } from "../utilities/Ui.js";

export const confessDef: CommandDef = {
  name: "confess",
  description: "Submit an anonymous confession.",
  guildOnly: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("confess")
      .setDescription("Submit an anonymous confession."),
  run: async (ctx: CommandContext) => {
    const guildId = ctx.guildId!;
    const config = await getConfessionsConfig(ctx.services, guildId);
    if (!config.channelId) {
      return ctx.replyWarning(
        "Not Configured",
        "An admin needs to configure the confession channel first.",
      );
    }
    const hash = await authorHashFor(ctx.services, guildId, ctx.user.id);
    if (await isBanned(ctx.services, guildId, hash)) {
      return ctx.replyError(
        "Blocked",
        "You can no longer submit confessions in this server.",
      );
    }
    if (await onCooldown(ctx.services, guildId, hash, config.cooldownMinutes)) {
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
    const modal = buildConfessionModal(config.allowAttachments);
    const interaction = ctx.interaction;
    if (interaction && "showModal" in interaction) {
      return interaction.showModal(modal);
    }
  },
};
