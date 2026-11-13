import type { CommandDefinition } from "@lumi/module-kit";
import { SlashCommandBuilder } from "discord.js";
import { openConfessModal } from "../openConfess.js";

export const confessCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("confess")
    .setDescription("Submit an anonymous confession.")
    .setDMPermission(false),
  guildOnly: true,
  async execute(interaction, services) {
    await openConfessModal(interaction, services);
  },
};