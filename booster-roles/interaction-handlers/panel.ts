import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ButtonInteraction, GuildMember } from "discord.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import { getBoosterConfig } from "../lib/config.js";
import { getRole } from "../lib/data.js";
import { accessDenial } from "../lib/access.js";
import { removeOwnerRole } from "../lib/cleanup.js";
import { colorToHex } from "../lib/engine.js";
import {
  IDS,
  buildColorModal,
  buildDeleteConfirm,
  buildNameModal,
  buildSharePrompt,
  buildUnsharePrompt,
} from "../lib/ui.js";

const BUTTON_IDS = new Set<string>([
  IDS.create,
  IDS.rename,
  IDS.recolor,
  IDS.share,
  IDS.shares,
  IDS.delete,
  IDS.deleteConfirm,
]);

@ApplyOptions<InteractionHandler.Options>({
  name: "booster-roles-panel",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class BoosterPanelHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    return BUTTON_IDS.has(interaction.customId)
      ? this.some(interaction.customId)
      : this.none();
  }

  public async run(interaction: ButtonInteraction, id: string) {
    if (!interaction.inCachedGuild()) return;
    const { member } = interaction;
    const config = await getBoosterConfig(member.guild.id);

    // "create" needs eligibility; everything else operates on an existing role.
    if (id === IDS.create) {
      const denial = await accessDenial(member, config);
      if (denial) return this.#reject(interaction, denial);
      if (await getRole(member.guild.id, member.id))
        return this.#reject(interaction, "You already have a custom role.");
      return interaction.showModal(buildNameModal("create"));
    }

    const record = await getRole(member.guild.id, member.id);
    if (!record)
      return this.#reject(interaction, "You don't have a custom role anymore.");

    switch (id) {
      case IDS.rename:
        return interaction.showModal(buildNameModal("rename", record.name));
      case IDS.recolor:
        return interaction.showModal(buildColorModal(colorToHex(record.color)));
      case IDS.share:
        return interaction.reply(
          ephemeralCard(
            buildSharePrompt(config.maxShares, record.sharedWith.length),
          ),
        );
      case IDS.shares:
        return interaction.reply(
          ephemeralCard(
            buildUnsharePrompt(this.#shareOptions(member, record.sharedWith)),
          ),
        );
      case IDS.delete:
        return interaction.reply(ephemeralCard(buildDeleteConfirm(record)));
      case IDS.deleteConfirm:
        await removeOwnerRole(
          member.guild,
          record,
          `Deleted by owner ${member.user.tag}`,
          config,
          "deleted by the owner",
        );
        return interaction.update(
          makeSuccessCard("Deleted", "Your custom role has been removed."),
        );
      default:
        return undefined;
    }
  }

  #shareOptions(member: GuildMember, ids: string[]) {
    return ids.map((id) => ({
      value: id,
      label: member.guild.members.cache.get(id)?.user.tag ?? id,
    }));
  }

  #reject(interaction: ButtonInteraction, message: string) {
    return interaction.reply(ephemeralCard(makeErrorCard("Error", message)));
  }
}
