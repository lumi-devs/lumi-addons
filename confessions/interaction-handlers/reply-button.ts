import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { ephemeralCard, makeErrorCard } from "#utilities/cards.js";
import { getConfessionsConfig } from "../lib/config.js";
import { authorHashFor, getConfession, isBanned } from "../lib/data.js";
import { buildReplyModal } from "../lib/ui.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "confessions-reply-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ConfessionReplyButtonHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("confess:reply:")) return this.none();
    const number = Number(interaction.customId.split(":")[2]);
    return Number.isInteger(number) ? this.some(number) : this.none();
  }

  public async run(interaction: ButtonInteraction, number: number) {
    if (!interaction.inGuild()) return;
    const { guildId } = interaction;

    const meta = await getConfession(guildId, number);
    if (!meta)
      return interaction.reply(
        ephemeralCard(
          makeErrorCard("Gone", "That confession no longer exists."),
        ),
      );

    const hash = await authorHashFor(guildId, interaction.user.id);
    if (await isBanned(guildId, hash))
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Blocked",
            "You can no longer participate in confessions here.",
          ),
        ),
      );

    const config = await getConfessionsConfig(guildId);
    return interaction.showModal(
      buildReplyModal(number, config.allowAttachments),
    );
  }
}
