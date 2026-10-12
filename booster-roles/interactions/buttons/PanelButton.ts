import type { ButtonInteraction } from "discord.js";
import { defineInteraction } from "@lumi-devs/lumi/interactions";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi-devs/lumi/ui";
import type { Container } from "@lumi-devs/lumi/services";
import { getBoosterConfig } from "../../utilities/Config.js";
import { deleteBoosterRole, getRole } from "../../utilities/Data.js";
import { accessDenial } from "../../utilities/Access.js";
import {
  buildColorModal,
  buildDeleteConfirm,
  buildNameModal,
  buildShareModal,
  buildUnsharePrompt,
} from "../../utilities/Ui.js";
import { InteractionIds, InteractionPrefixes, MODULE_NAME } from "../../utilities/Keys.js";

export const panelButton = defineInteraction<ButtonInteraction>({
  prefix: InteractionPrefixes.ROLE,
  kinds: ["button"],
  module: MODULE_NAME,
  async run(services: Container, interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Guild Only", "This only works inside a server.")),
      );
      return;
    }

    const guildId = interaction.guildId;
    const config = await getBoosterConfig(services, guildId);

    if (interaction.customId === InteractionIds.CREATE) {
      const denial = await accessDenial(services, guildId, interaction.user.id, config);
      if (denial) {
        await interaction.reply(ephemeralCard(makeErrorCard("Error", denial)));
        return;
      }
      if (await getRole(services, guildId, interaction.user.id)) {
        await interaction.reply(
          ephemeralCard(makeErrorCard("Error", "You already have a custom role.")),
        );
        return;
      }
      await interaction.showModal(buildNameModal("create", config.nameMaxLength));
      return;
    }

    const role = await getRole(services, guildId, interaction.user.id);
    if (!role) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Error", "You don't have a custom role anymore.")),
      );
      return;
    }

    switch (interaction.customId) {
      case InteractionIds.RENAME:
        await interaction.showModal(
          buildNameModal("rename", config.nameMaxLength, role.name),
        );
        return;
      case InteractionIds.RECOLOR:
        await interaction.showModal(buildColorModal(role.color ?? undefined));
        return;
      case InteractionIds.SHARE:
        if (role.sharedWith.length >= config.maxShares) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Can't Share",
                `You can share with at most ${config.maxShares} member(s).`,
              ),
            ),
          );
          return;
        }
        await interaction.showModal(buildShareModal());
        return;
      case InteractionIds.SHARES:
        await interaction.reply(ephemeralCard(buildUnsharePrompt(role.sharedWith)));
        return;
      case InteractionIds.DELETE:
        await interaction.reply(ephemeralCard(buildDeleteConfirm(role)));
        return;
      case InteractionIds.DELETE_CONFIRM:
        await deleteBoosterRole(services, guildId, role, config, "deleted by the owner");
        await interaction.reply(
          ephemeralCard(
            makeSuccessCard("Deleted", "Your custom role has been removed."),
          ),
        );
        return;
      default:
        return;
    }
  },
});
