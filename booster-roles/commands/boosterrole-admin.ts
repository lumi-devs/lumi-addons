import type { CommandDefinition } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  noPingCard,
} from "@lumi/ui";
import { SlashCommandBuilder } from "discord.js";
import { getConfig, ModuleName, PermitNode } from "../config.js";
import {
  addBlacklist,
  getBlacklistRecord,
  getRoleById,
  getRoleByOwner,
  listBlacklist,
  listRoleRecords,
  removeBlacklist,
} from "../data.js";
import {
  botRoleGuard,
  deleteBoosterRole,
  protectedRoleReason,
  removeUserFromShares,
} from "../roles.js";
import { buildBlacklistPageCard } from "../ui.js";

const boosterRoleAdminCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("boosterrole-admin")
    .setDescription("Administer custom booster roles")
    .addSubcommand((sub) =>
      sub.setName("stats").setDescription("Show booster role statistics"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("force-delete")
        .setDescription("Delete a booster role immediately")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("The role to delete")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for the deletion")
            .setMaxLength(200)
            .setRequired(false),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("blacklist")
        .setDescription("Manage the booster role blacklist")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Block a member from custom roles")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("The member to block")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("reason")
                .setDescription("Reason for the block")
                .setMaxLength(200)
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Unblock a member from custom roles")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("The member to unblock")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName("list").setDescription("List blocked members"),
        ),
    ),
  guildOnly: true,
  requiredPermit: PermitNode,
  async execute(interaction, services) {
    const guild = interaction.guild;
    const guildId = interaction.guildId;
    if (!guild || !guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "This command only works inside a server."),
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

    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();
    const config = await getConfig(services, guildId);

    if (group === "blacklist") {
      if (subcommand === "add") {
        const target = interaction.options.getUser("user", true);
        if (await getBlacklistRecord(services, guildId, target.id)) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard("Already Blocked", `<@${target.id}> is already blacklisted.`),
            ),
          );
          return;
        }

        const reason = interaction.options.getString("reason") ?? undefined;
        await addBlacklist(
          services,
          guildId,
          target.id,
          interaction.user.id,
          reason,
        );

        const owned = await getRoleByOwner(services, guildId, target.id);
        const roleDeleted = owned
          ? await deleteBoosterRole(
              services,
              guildId,
              owned,
              config,
              "the owner was blacklisted",
            )
          : false;
        const shares = await removeUserFromShares(services, guildId, target.id);

        await interaction.reply(
          ephemeralCard(
            noPingCard(
              makeSuccessCard("Member Blocked", [
                `<@${target.id}> can no longer use custom roles.`,
                ...(owned
                  ? [
                      roleDeleted
                        ? "Their custom role was deleted."
                        : "Their custom role data was removed, but I couldn't delete the Discord role.",
                    ]
                  : []),
                ...(shares > 0
                  ? [`Removed them from ${shares} shared role(s).`]
                  : []),
              ]),
            ),
          ),
        );
        return;
      }

      if (subcommand === "remove") {
        const target = interaction.options.getUser("user", true);
        const removed = await removeBlacklist(services, guildId, target.id);
        await interaction.reply(
          ephemeralCard(
            removed > 0
              ? noPingCard(
                  makeSuccessCard(
                    "Member Unblocked",
                    `<@${target.id}> can use custom roles again.`,
                  ),
                )
              : makeErrorCard("Not Blocked", `<@${target.id}> is not blacklisted.`),
          ),
        );
        return;
      }

      const records = await listBlacklist(services, guildId);
      await interaction.reply(
        ephemeralCard(
          noPingCard(
            buildBlacklistPageCard(records, 0, interaction.user.id),
          ),
        ),
      );
      return;
    }

    if (subcommand === "stats") {
      const [roles, blacklist] = await Promise.all([
        listRoleRecords(services, guildId),
        listBlacklist(services, guildId),
      ]);
      const shares = roles.reduce((total, role) => total + role.shares.length, 0);
      const uniqueShares = new Set(roles.flatMap((role) => role.shares)).size;
      const grace = roles.filter((role) => role.graceUntil !== null).length;
      const expired = roles.filter(
        (role) => role.graceUntil !== null && role.graceUntil <= Date.now(),
      ).length;

      await interaction.reply(
        ephemeralCard(
          makeInfoCard("📊 Booster Roles", [
            `**Custom roles** ${roles.length}`,
            `**Active shares** ${shares} (${uniqueShares} unique member(s))`,
            `**In grace period** ${grace}`,
            `**Grace expired** ${expired}`,
            `**Blacklisted** ${blacklist.length}`,
          ]),
        ),
      );
      return;
    }

    const selected = interaction.options.getRole("role", true);
    const role = await guild.roles.fetch(selected.id).catch(() => null);
    if (!role) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Role Not Found", "That role no longer exists."),
        ),
      );
      return;
    }
    const protection = protectedRoleReason(guild, role);
    if (protection) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Can't Delete That Role", protection)),
      );
      return;
    }
    const guard = await botRoleGuard(guild, role);
    if (guard) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Missing Permission", guard)),
      );
      return;
    }

    const reason =
      interaction.options.getString("reason") ?? "no reason provided";
    const record = await getRoleById(services, guildId, role.id);
    let deleted = false;
    if (record) {
      deleted = await deleteBoosterRole(
        services,
        guildId,
        record,
        config,
        `force-deleted by a moderator (${reason})`,
      );
    } else {
      deleted = await role
        .delete(`Force-deleted booster role (${reason})`)
        .then(() => true)
        .catch(() => false);
    }
    if (!deleted) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Delete Failed",
            "I couldn't delete that role. Check my role hierarchy.",
          ),
        ),
      );
      return;
    }

    await interaction.reply(
      ephemeralCard(
        noPingCard(
          makeSuccessCard(
            "Role Deleted",
            `Deleted <@&${role.id}> (${reason}).`,
          ),
        ),
      ),
    );
  },
};

export default boosterRoleAdminCommand;
