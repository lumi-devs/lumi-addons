import type { CommandDefinition } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  noPingCard,
} from "@lumi/ui";
import type { ChatInputCommandInteraction, Guild } from "discord.js";
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
  fetchMember,
  isEligible,
  loadOwnedRole,
  loadSharedRoles,
  protectedRoleReason,
  removeUserFromShares,
} from "../roles.js";
import {
  buildBlacklistPageCard,
  buildCreatePanel,
  buildOwnerPanel,
  buildSharedPanel,
  type SharedRoleView,
} from "../ui.js";

type Services = Parameters<NonNullable<CommandDefinition["execute"]>>[1];

async function hasPermit(
  interaction: ChatInputCommandInteraction,
  services: Services,
  guild: Guild,
  node: string,
): Promise<boolean> {
  const roles = interaction.member?.roles;
  const roleIds = !roles
    ? []
    : Array.isArray(roles)
      ? roles.filter((roleId) => roleId !== guild.id)
      : Array.from(roles.cache.keys()).filter(
          (roleId) => roleId !== guild.id,
        );
  const enforcePermits =
    (await services.config.get(guild.id, "enforcePermits")) === true;
  const result = await services.permits.explainPermit(
    {
      guildId: guild.id,
      userId: interaction.user.id,
      roleIds,
      ...(interaction.channelId ? { channelId: interaction.channelId } : {}),
      guildOwnerId: guild.ownerId,
      permitNode: node,
      ...(enforcePermits ? { managerBypass: false } : {}),
    },
    services.client,
  );
  return result.allowed;
}

async function runList(
  interaction: ChatInputCommandInteraction,
  services: Services,
  guildId: string,
): Promise<void> {
  const roles = await listRoleRecords(services, guildId);
  if (roles.length === 0) {
    await interaction.reply(
      ephemeralCard(makeInfoCard("🎨 Custom Roles", "No custom roles yet.")),
    );
    return;
  }
  const lines = roles
    .slice(0, 20)
    .map(
      (role) =>
        `<@&${role.roleId}> — <@${role.ownerId}>${
          role.shares.length ? ` (+${role.shares.length} shared)` : ""
        }`,
    );
  if (roles.length > 20) lines.push(`*…and ${roles.length - 20} more.*`);
  await interaction.reply(
    ephemeralCard(makeInfoCard("🎨 Custom Roles", lines.join("\n"))),
  );
}

async function runInfo(
  interaction: ChatInputCommandInteraction,
  services: Services,
  guildId: string,
): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const record = await getRoleByOwner(services, guildId, target.id);
  if (!record) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("No Custom Role", `<@${target.id}> has no custom role.`),
      ),
    );
    return;
  }
  const lines = [
    `**Owner:** <@${record.ownerId}>`,
    `**Role:** <@&${record.roleId}>`,
    `**Created:** <t:${Math.floor(record.createdAt / 1000)}:R>`,
    `**Shared with:** ${
      record.shares.length
        ? record.shares.map((id) => `<@${id}>`).join(", ")
        : "*no one*"
    }`,
    ...(record.graceUntil !== null
      ? [`**Grace ends:** <t:${Math.floor(record.graceUntil / 1000)}:R>`]
      : []),
  ];
  await interaction.reply(
    ephemeralCard(makeInfoCard("🎨 Custom Role", lines.join("\n"))),
  );
}

async function runStats(
  interaction: ChatInputCommandInteraction,
  services: Services,
  guildId: string,
): Promise<void> {
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
}

async function runDeleteUser(
  interaction: ChatInputCommandInteraction,
  services: Services,
  guildId: string,
): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const record = await getRoleByOwner(services, guildId, target.id);
  if (!record) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("No Custom Role", `<@${target.id}> has no custom role.`),
      ),
    );
    return;
  }
  const config = await getConfig(services, guildId);
  const reason =
    interaction.options.getString("reason") ?? "no reason provided";
  const deleted = await deleteBoosterRole(
    services,
    guildId,
    record,
    config,
    `deleted by a moderator (${reason})`,
  );
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
          `Removed <@${target.id}>'s custom role (${reason}).`,
        ),
      ),
    ),
  );
}

async function runDeleteRole(
  interaction: ChatInputCommandInteraction,
  services: Services,
  guild: Guild,
  guildId: string,
): Promise<void> {
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

  const config = await getConfig(services, guildId);
  if (
    config.qualifyingRoleIds.includes(role.id) ||
    config.anchorRoleId === role.id
  ) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Can't Delete That Role",
          "That role is used by the booster role configuration.",
        ),
      ),
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
      `deleted by a moderator (${reason})`,
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
        makeSuccessCard("Role Deleted", `Deleted <@&${role.id}> (${reason}).`),
      ),
    ),
  );
}

async function runBlacklistAdd(
  interaction: ChatInputCommandInteraction,
  services: Services,
  guildId: string,
): Promise<void> {
  const target = interaction.options.getUser("user", true);
  if (await getBlacklistRecord(services, guildId, target.id)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Already Blocked",
          `<@${target.id}> is already blacklisted.`,
        ),
      ),
    );
    return;
  }

  const reason = interaction.options.getString("reason") ?? undefined;
  await addBlacklist(services, guildId, target.id, interaction.user.id, reason);

  const config = await getConfig(services, guildId);
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
          ...(shares > 0 ? [`Removed them from ${shares} shared role(s).`] : []),
        ]),
      ),
    ),
  );
}

async function runBlacklistRemove(
  interaction: ChatInputCommandInteraction,
  services: Services,
  guildId: string,
): Promise<void> {
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
}

async function runBlacklistList(
  interaction: ChatInputCommandInteraction,
  services: Services,
  guildId: string,
): Promise<void> {
  const records = await listBlacklist(services, guildId);
  await interaction.reply(
    ephemeralCard(
      noPingCard(buildBlacklistPageCard(records, 0, interaction.user.id)),
    ),
  );
}

const boosterRoleCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("boosterrole")
    .setDescription("Personal custom roles for server boosters")
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Open your personal booster role panel"),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("admin")
        .setDescription("Administer custom booster roles")
        .addSubcommand((sub) =>
          sub.setName("stats").setDescription("Show booster role statistics"),
        )
        .addSubcommand((sub) =>
          sub.setName("list").setDescription("List all custom booster roles"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("info")
            .setDescription("Inspect a member's custom role")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("The member to inspect")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("delete")
            .setDescription("Delete a member's custom role")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("The member whose role to delete")
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
        .addSubcommand((sub) =>
          sub
            .setName("delete-role")
            .setDescription("Delete a booster role by Discord role")
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
        .addSubcommand((sub) =>
          sub
            .setName("blacklist-add")
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
            .setName("blacklist-remove")
            .setDescription("Unblock a member from custom roles")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("The member to unblock")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("blacklist-list")
            .setDescription("List blocked members"),
        ),
    ),
  guildOnly: true,
  async execute(interaction, services) {
    const guild = interaction.guild;
    const guildId = interaction.guildId;
    if (!guild || !guildId) {
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

    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (group === "admin") {
      if (!(await hasPermit(interaction, services, guild, PermitNode))) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Admin Only",
              "You need the `roles.boosterroles` permit to administer custom roles.",
            ),
          ),
        );
        return;
      }

      if (subcommand === "stats") return runStats(interaction, services, guildId);
      if (subcommand === "list") return runList(interaction, services, guildId);
      if (subcommand === "info") return runInfo(interaction, services, guildId);
      if (subcommand === "delete")
        return runDeleteUser(interaction, services, guildId);
      if (subcommand === "delete-role")
        return runDeleteRole(interaction, services, guild, guildId);
      if (subcommand === "blacklist-add")
        return runBlacklistAdd(interaction, services, guildId);
      if (subcommand === "blacklist-remove")
        return runBlacklistRemove(interaction, services, guildId);
      return runBlacklistList(interaction, services, guildId);
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
        ephemeralCard(noPingCard(buildOwnerPanel(owned.record, owned.role, config))),
      );
      return;
    }

    const shared = await loadSharedRoles(services, guildId, interaction.user.id);
    const views: SharedRoleView[] = shared.map(({ record, role }) => ({
      roleId: record.roleId,
      ownerId: record.ownerId,
      name: role.name,
    }));

    const member = await fetchMember(guild, interaction.user.id);
    if (member && isEligible(member, config)) {
      await interaction.reply(
        ephemeralCard(
          noPingCard(
            buildCreatePanel(interaction.user.id, config, views.length > 0),
          ),
        ),
      );
      return;
    }

    if (views.length > 0) {
      await interaction.reply(
        ephemeralCard(noPingCard(buildSharedPanel(interaction.user.id, views))),
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
