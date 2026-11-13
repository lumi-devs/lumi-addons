import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import type { Interaction } from "discord.js";
import { ModuleName } from "../config.js";
import { openConfessModal } from "../openConfess.js";
import { handleConfessSubmit } from "./handlers/confess.js";
import { handleDmOptOut, handleListButton } from "./handlers/misc.js";
import {
  handleReplyButton,
  handleReplySubmit,
} from "./handlers/reply.js";
import {
  handleReportButton,
  handleReportReply,
} from "./handlers/reports.js";
import { isReplyPath } from "./helpers.js";

export const interactionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith(`${ModuleName}:`)) return;
      const parts = interaction.customId.split(":");
      const action = parts[1];

      if (action === "mutedms" || action === "unmutedms") {
        await handleDmOptOut(
          interaction,
          services,
          parts[2],
          action === "mutedms",
        );
        return;
      }

      if (action === "new") {
        await openConfessModal(interaction, services);
        return;
      }

      if (action === "reply" || action === "replyto") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        const parentPath = action === "replyto" && isReplyPath(parts[3])
          ? parts[3]
          : null;
        if (action === "replyto" && !parentPath) return;
        await handleReplyButton(interaction, services, number, parentPath);
        return;
      }

      if (action === "report") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        await handleReportButton(interaction, services, number);
        return;
      }

      if (action === "reportreply") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        if (!isReplyPath(parts[3])) return;
        await handleReportReply(interaction, services, number, parts[3]);
        return;
      }

      if (action === "list") {
        await handleListButton(interaction, services, parts);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith(`${ModuleName}:`)) return;
      const parts = interaction.customId.split(":");
      const action = parts[1];

      if (action === "confess") {
        await handleConfessSubmit(interaction, services);
        return;
      }

      if (action === "replysubmit") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        await handleReplySubmit(interaction, services, number, null);
        return;
      }

      if (action === "replytosubmit") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        if (!isReplyPath(parts[3])) return;
        await handleReplySubmit(interaction, services, number, parts[3]);
      }
    }
  },
};
