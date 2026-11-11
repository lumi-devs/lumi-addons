import type { CommandDefinition } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  noPingCard,
} from "@lumi/ui";
import { SlashCommandBuilder } from "discord.js";
import { getConfig, ModuleName } from "../config.js";
import { getBlacklistRecord } from "../data.js";
import {
  fetchMember,
  isEligible,
  loadOwnedRole,
  loadSharedRoles,
  resolveGuild,
} from "../roles.js";
import {
  buildCreatePanel,
  buildOwnerPanel,
  buildSharedPanel,
  type SharedRoleView,
} from "../ui.js";

const boosterRoleCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("boosterrole")
    .setDescription("Open your personal booster role panel"),
  guildOnly: true,
  async execute(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Booster roles only work inside a server."),
        ),
      );
      return;
    }
    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "The booster roles module is disabled on this server.",
          ),
        ),
      );
      return;
    }

    const config = await getConfig(services, guildId);
    if (await getBlacklistRecord(services, guildId, interaction.user.id)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Blocked",
            "You're blacklisted from using custom roles here.",
          ),
        ),
      );
      return;
    }

    const owned = await loadOwnedRole(services, guildId, interaction.user.id);
    if (owned) {
      await interaction.reply(
        ephemeralCard(
          noPingCard(
            buildOwnerPanel(owned.record, owned.role, config),
          ),
        ),
      );
      return;
    }

    const shared = await loadSharedRoles(services, guildId, interaction.user.id);
    const views: SharedRoleView[] = shared.map(({ record, role }) => ({
      roleId: record.roleId,
      ownerId: record.ownerId,
      name: role.name,
    }));

    const guild = await resolveGuild(services, guildId);
    const member = guild
      ? await fetchMember(guild, interaction.user.id)
      : null;
    if (member && isEligible(member, config)) {
      await interaction.reply(
        ephemeralCard(
          noPingCard(
            buildCreatePanel(
              interaction.user.id,
              config,
              views.length > 0,
            ),
          ),
        ),
      );
      return;
    }

    if (views.length > 0) {
      await interaction.reply(
        ephemeralCard(
          noPingCard(buildSharedPanel(interaction.user.id, views)),
        ),
      );
      return;
    }

    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Boosters Only",
          "You need to be boosting the server or hold a qualifying role to use custom roles.",
        ),
      ),
    );
  },
};

export default boosterRoleCommand;
