import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { isModuleEnabled } from "#utilities/listeners.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "#utilities/cards.js";
import { MODULE_NAME } from "../keys.js";
import { evaluateMember } from "../lib/evaluate.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "promoter-check",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class PromoterCheckHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    return interaction.customId === "promoter:check"
      ? this.some()
      : this.none();
  }

  public async run(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;
    if (!(await isModuleEnabled(interaction.guildId, MODULE_NAME))) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Disabled", "The promoter module is disabled here."),
        ),
      );
      return;
    }

    const member = await interaction.guild.members
      .fetch({ user: interaction.user.id, withPresences: true })
      .catch(() => interaction.member);
    const result = await evaluateMember(member);

    const cards = {
      granted: makeSuccessCard(
        "Role Granted",
        "Thanks for promoting the server — enjoy the role!",
      ),
      revoked: makeWarningCard(
        "Role Removed",
        "Your status no longer advertises the server, so the role was removed.",
      ),
      unchanged: makeInfoCard(
        "No Change",
        "Nothing to update. Put the server invite or tag in your **custom status** to earn the role — and note I can't read statuses of invisible members.",
      ),
      unconfigured: makeErrorCard(
        "Not Configured",
        "This server hasn't finished configuring the promoter module.",
      ),
    } as const;

    await interaction.reply(ephemeralCard(cards[result]));
  }
}
