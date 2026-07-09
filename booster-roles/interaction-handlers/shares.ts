import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { AnySelectMenuInteraction } from "discord.js";
import { userMention } from "@discordjs/formatters";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import { getBoosterConfig } from "../lib/config.js";
import { addShare, getRole, removeShare } from "../lib/data.js";
import { grantRole, revokeRole } from "../lib/roles.js";
import { IDS } from "../lib/ui.js";

interface Parsed {
  kind: "share" | "unshare";
  target: string;
}

@ApplyOptions<InteractionHandler.Options>({
  name: "booster-roles-shares",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class BoosterShareHandler extends InteractionHandler {
  public override parse(interaction: AnySelectMenuInteraction) {
    const target = interaction.values[0];
    if (!target) return this.none();
    if (
      interaction.customId === IDS.shareSelect &&
      interaction.isUserSelectMenu()
    )
      return this.some({ kind: "share", target } as Parsed);
    if (
      interaction.customId === IDS.unshareSelect &&
      interaction.isStringSelectMenu()
    )
      return this.some({ kind: "unshare", target } as Parsed);
    return this.none();
  }

  public async run(interaction: AnySelectMenuInteraction, data: Parsed) {
    if (!interaction.inCachedGuild()) return;
    const { member } = interaction;
    const record = await getRole(member.guild.id, member.id);
    if (!record)
      return interaction.update(
        ephemeralCard(
          makeErrorCard("Gone", "You no longer have a custom role."),
        ),
      );

    if (data.kind === "share") {
      const config = await getBoosterConfig(member.guild.id);
      const result = await addShare(
        member.guild.id,
        member.id,
        data.target,
        config.maxShares,
      );
      if (!result.ok)
        return interaction.update(
          ephemeralCard(makeErrorCard("Can't Share", result.reason)),
        );
      await grantRole(
        member.guild,
        record.roleId,
        data.target,
        `Shared by ${member.user.tag}`,
      );
      return interaction.update(
        ephemeralCard(
          makeSuccessCard(
            "Shared",
            `${userMention(data.target)} now has your role.`,
          ),
        ),
      );
    }

    const removed = await removeShare(member.guild.id, member.id, data.target);
    if (removed)
      await revokeRole(
        member.guild,
        record.roleId,
        data.target,
        `Unshared by ${member.user.tag}`,
      );
    return interaction.update(
      ephemeralCard(
        makeSuccessCard(
          "Updated",
          `${userMention(data.target)} no longer has your role.`,
        ),
      ),
    );
  }
}
