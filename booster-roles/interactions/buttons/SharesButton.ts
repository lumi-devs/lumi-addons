import type { AnySelectMenuInteraction } from "discord.js";
import { defineInteraction } from "#src/lib/interactions/InteractionDef.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#src/lib/ui/Cards.js";
import type { Container } from "#src/lib/Services.js";
import { getRole, removeShare } from "../../utilities/Data.js";
import { InteractionIds, InteractionPrefixes, MODULE_NAME } from "../../utilities/Keys.js";

export const sharesButton = defineInteraction<AnySelectMenuInteraction>({
  prefix: InteractionPrefixes.SELECT,
  kinds: ["select"],
  module: MODULE_NAME,
  async run(services: Container, interaction: AnySelectMenuInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Guild Only", "This only works inside a server.")),
      );
      return;
    }

    if (interaction.customId !== InteractionIds.UNSHARE_SELECT) return;

    const guildId = interaction.guildId;
    const target = interaction.values[0];
    if (!target) return;

    const role = await getRole(services, guildId, interaction.user.id);
    if (!role) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Gone", "You no longer have a custom role.")),
      );
      return;
    }

    if (await removeShare(services, guildId, interaction.user.id, target)) {
      const guild =
        services.client.guilds.cache.get(guildId) ??
        (await services.client.guilds.fetch(guildId).catch(() => null));
      if (guild) {
        const member = await guild.members.fetch(target).catch(() => null);
        if (member) {
          await member.roles.remove(role.roleId, "Booster role unshared").catch(() => {});
        }
      }
    }

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Updated", `<@${target}> no longer has your role.`),
      ),
    );
  },
});
