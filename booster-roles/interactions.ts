import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  noPingCard,
} from "@lumi/ui";
import type {
  ButtonInteraction,
  Guild,
  GuildMember,
  Interaction,
  ModalSubmitInteraction,
  Role,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { getConfig, ModuleName, type Config } from "./config.js";
import { getBlacklistRecord, listBlacklist } from "./data.js";
import { Ids, parseInteractionId } from "./ids.js";
import {
  createBoosterRole,
  deleteBoosterRole,
  fetchMember,
  fetchRole,
  isEligible,
  loadOwnedRole,
  loadRoleById,
  loadSharedRoles,
  recolorBoosterRole,
  removeShareFromRole,
  renameBoosterRole,
  resolveGuild,
  shareRoleWithMember,
  type OwnedRole,
} from "./roles.js";
import {
  buildBlacklistPageCard,
  buildColorModal,
  buildCreatePanel,
  buildDeleteConfirmPanel,
  buildManageSharesPanel,
  buildNameModal,
  buildOwnerPanel,
  buildSharedPanel,
  type ShareOption,
  type SharedRoleView,
} from "./ui.js";

async function deferEphemeral(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable() || interaction.deferred || interaction.replied) {
    return;
  }
  await interaction
    .deferReply({ flags: MessageFlags.Ephemeral })
    .catch(() => undefined);
}

async function deferComponent(interaction: Interaction): Promise<void> {
  if (
    !interaction.isMessageComponent() ||
    interaction.deferred ||
    interaction.replied
  ) {
    return;
  }
  await interaction.deferUpdate().catch(() => undefined);
}

async function announceCreation(
  services: ModuleServices,
  config: Config,
  member: GuildMember,
  role: Role,
): Promise<void> {
  if (!config.showcaseChannelId) return;
  const channel = await services.client.channels
    .fetch(config.showcaseChannelId)
    .catch(() => null);
  if (!channel?.isSendable()) return;

  const card = noPingCard(
    makeInfoCard("✨ New Booster Role", [
      `<@${member.id}> just created <@&${role.id}>.`,
      "Boost the server to create your own custom role.",
    ]),
  );
  await channel.send(cardCreateOptions(card)).catch(() => undefined);
}

type OwnedRoleInteraction =
  | ButtonInteraction
  | ModalSubmitInteraction
  | UserSelectMenuInteraction;

async function requireOwnedRole(
  interaction: OwnedRoleInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<{ owned: OwnedRole; guild: Guild } | null> {
  await deferEphemeral(interaction);
  const owned = await loadOwnedRole(services, guildId, interaction.user.id);
  const guild = await resolveGuild(services, guildId);
  if (!owned || !guild) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard("Role Gone", "You don't have a custom role anymore."),
      ),
    );
    return null;
  }
  return { owned, guild };
}

async function handleCreateModal(
  interaction: Interaction,
  services: ModuleServices,
  guildId: string,
  config: Config,
): Promise<void> {
  if (!interaction.isModalSubmit()) return;

  await deferEphemeral(interaction);
  const guild = await resolveGuild(services, guildId);
  const member = guild
    ? await fetchMember(guild, interaction.user.id)
    : null;
  if (!guild || !member || !isEligible(member, config)) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard(
          "Boosters Only",
          "You no longer qualify for a custom role.",
        ),
      ),
    );
    return;
  }

  const result = await createBoosterRole(
    services,
    guild,
    member,
    interaction.fields.getTextInputValue("name"),
    config,
  );
  if (!result.ok) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Can't Create Role", result.reason)),
    );
    return;
  }

  await interaction.editReply(
    ephemeralCard(
      noPingCard(buildOwnerPanel(result.record, result.role, config)),
    ),
  );
  await announceCreation(services, config, member, result.role);
}

async function handleRenameModal(
  interaction: Interaction,
  services: ModuleServices,
  guildId: string,
  config: Config,
): Promise<void> {
  if (!interaction.isModalSubmit()) return;

  const context = await requireOwnedRole(interaction, services, guildId);
  if (!context) return;
  const { owned, guild } = context;

  const error = await renameBoosterRole(
    guild,
    owned.role,
    interaction.fields.getTextInputValue("name"),
    config,
  );
  if (error) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Can't Rename", error)),
    );
    return;
  }

  const refreshed = (await fetchRole(guild, owned.role.id)) ?? owned.role;
  await interaction.editReply(
    ephemeralCard(
      noPingCard(buildOwnerPanel(owned.record, refreshed, config)),
    ),
  );
}

async function handleColorModal(
  interaction: Interaction,
  services: ModuleServices,
  guildId: string,
  config: Config,
): Promise<void> {
  if (!interaction.isModalSubmit()) return;

  const context = await requireOwnedRole(interaction, services, guildId);
  if (!context) return;
  const { owned, guild } = context;

  const error = await recolorBoosterRole(
    guild,
    owned.role,
    interaction.fields.getTextInputValue("color"),
  );
  if (error) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Can't Recolour", error)),
    );
    return;
  }

  const refreshed = (await fetchRole(guild, owned.role.id)) ?? owned.role;
  await interaction.editReply(
    ephemeralCard(
      noPingCard(buildOwnerPanel(owned.record, refreshed, config)),
    ),
  );
}

async function handleShareSelect(
  interaction: UserSelectMenuInteraction,
  services: ModuleServices,
  guildId: string,
  config: Config,
): Promise<void> {
  const targetId = interaction.values[0];
  if (!targetId) return;

  const context = await requireOwnedRole(interaction, services, guildId);
  if (!context) return;
  const { owned, guild } = context;

  const result = await shareRoleWithMember(
    services,
    guild,
    owned.record,
    owned.role,
    targetId,
    config,
  );
  if (!result.ok) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Can't Share", result.reason)),
    );
    return;
  }

  await interaction.editReply(
    ephemeralCard(
      noPingCard(
        makeSuccessCard("Role Shared", `<@${targetId}> now has your role.`),
      ),
    ),
  );
}

async function handleManageShares(
  interaction: ButtonInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const context = await requireOwnedRole(interaction, services, guildId);
  if (!context) return;
  const { owned, guild } = context;

  const options: ShareOption[] = [];
  for (const memberId of owned.record.shares.slice(0, 25)) {
    const member = await fetchMember(guild, memberId);
    options.push({
      label: member?.user.username ?? memberId,
      value: memberId,
      description: member ? `User ID ${memberId}` : "Member is no longer here",
    });
  }

  await interaction.editReply(
    ephemeralCard(
      noPingCard(buildManageSharesPanel(interaction.user.id, options)),
    ),
  );
}

async function handleUnshare(
  interaction: StringSelectMenuInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const targetId = interaction.values[0];
  if (!targetId) return;

  await deferEphemeral(interaction);
  const owned = await loadOwnedRole(services, guildId, interaction.user.id);
  if (!owned) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard("Role Gone", "You don't have a custom role anymore."),
      ),
    );
    return;
  }

  const result = await removeShareFromRole(
    services,
    guildId,
    owned.record,
    targetId,
    owned.role,
  );
  if (!result.ok) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Can't Unshare", result.reason)),
    );
    return;
  }
  if (!result.removed) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard("Not Shared", "That member doesn't have your role."),
      ),
    );
    return;
  }

  await interaction.editReply(
    ephemeralCard(
      noPingCard(
        makeSuccessCard(
          "Share Removed",
          `<@${targetId}> no longer has your role.`,
        ),
      ),
    ),
  );
}

async function handleRenounce(
  interaction: StringSelectMenuInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const roleId = interaction.values[0];
  if (!roleId) return;

  await deferEphemeral(interaction);
  const loaded = await loadRoleById(services, guildId, roleId);
  if (!loaded?.record.shares.includes(interaction.user.id)) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard("Role Gone", "That role is no longer shared with you."),
      ),
    );
    return;
  }

  const result = await removeShareFromRole(
    services,
    guildId,
    loaded.record,
    interaction.user.id,
    loaded.role,
  );
  if (!result.ok) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Can't Renounce", result.reason)),
    );
    return;
  }

  await interaction.editReply(
    ephemeralCard(
      noPingCard(
        makeSuccessCard(
          "Role Renounced",
          `You no longer have <@&${roleId}>.`,
        ),
      ),
    ),
  );
}

export async function handleBoosterRoleInteraction(
  interaction: Interaction,
  services: ModuleServices,
): Promise<void> {
  if (
    !interaction.isButton() &&
    !interaction.isAnySelectMenu() &&
    !interaction.isModalSubmit()
  ) {
    return;
  }

  const parsed = parseInteractionId(interaction.customId);
  if (!parsed) return;

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
  if (interaction.user.id !== parsed.userId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Not Your Panel", "This panel belongs to someone else."),
      ),
    );
    return;
  }

  try {
    if (parsed.action === "admin-blacklist-page") {
      if (!interaction.isButton()) return;
      await deferComponent(interaction);
      const records = await listBlacklist(services, guildId);
      const page = Number.parseInt(parsed.rest[1] ?? "0", 10);
      await interaction.editReply(
        ephemeralCard(
          noPingCard(
            buildBlacklistPageCard(
              records,
              Number.isFinite(page) ? page : 0,
              interaction.user.id,
            ),
          ),
        ),
      );
      return;
    }

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

    const config = await getConfig(services, guildId);

    switch (parsed.action) {
      case "create": {
        if (!interaction.isButton()) return;
        const guild = await resolveGuild(services, guildId);
        const member = guild
          ? await fetchMember(guild, interaction.user.id)
          : null;
        if (!member || !isEligible(member, config)) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Boosters Only",
                "You no longer qualify for a custom role.",
              ),
            ),
          );
          return;
        }
        if (await loadOwnedRole(services, guildId, interaction.user.id)) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Already Have One",
                "You already have a custom role.",
              ),
            ),
          );
          return;
        }
        await interaction.showModal(
          buildNameModal(
            Ids.modalCreate(interaction.user.id),
            "Create Your Role",
            config.maxNameLength,
          ),
        );
        return;
      }
      case "rename": {
        if (!interaction.isButton()) return;
        const owned = await loadOwnedRole(
          services,
          guildId,
          interaction.user.id,
        );
        if (!owned) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Role Gone",
                "You don't have a custom role anymore.",
              ),
            ),
          );
          return;
        }
        await interaction.showModal(
          buildNameModal(
            Ids.modalRename(interaction.user.id),
            "Rename Your Role",
            config.maxNameLength,
            owned.role.name,
          ),
        );
        return;
      }
      case "color": {
        if (!interaction.isButton()) return;
        const owned = await loadOwnedRole(
          services,
          guildId,
          interaction.user.id,
        );
        if (!owned) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Role Gone",
                "You don't have a custom role anymore.",
              ),
            ),
          );
          return;
        }
        await interaction.showModal(
          buildColorModal(
            Ids.modalColor(interaction.user.id),
            owned.role.color === 0 ? undefined : owned.role.hexColor,
          ),
        );
        return;
      }
      case "share": {
        if (!interaction.isUserSelectMenu()) return;
        await handleShareSelect(interaction, services, guildId, config);
        return;
      }
      case "manage": {
        if (!interaction.isButton()) return;
        await handleManageShares(interaction, services, guildId);
        return;
      }
      case "unshare": {
        if (!interaction.isStringSelectMenu()) return;
        await handleUnshare(interaction, services, guildId);
        return;
      }
      case "renounce": {
        if (!interaction.isStringSelectMenu()) return;
        await handleRenounce(interaction, services, guildId);
        return;
      }
      case "delete": {
        if (!interaction.isButton()) return;
        await deferEphemeral(interaction);
        const owned = await loadOwnedRole(
          services,
          guildId,
          interaction.user.id,
        );
        if (!owned) {
          await interaction.editReply(
            ephemeralCard(
              makeErrorCard(
                "Role Gone",
                "You don't have a custom role anymore.",
              ),
            ),
          );
          return;
        }
        await interaction.editReply(
          ephemeralCard(
            noPingCard(
              buildDeleteConfirmPanel(interaction.user.id, owned.role),
            ),
          ),
        );
        return;
      }
      case "delete-confirm": {
        if (!interaction.isButton()) return;
        await deferEphemeral(interaction);
        const owned = await loadOwnedRole(
          services,
          guildId,
          interaction.user.id,
        );
        if (!owned) {
          await interaction.editReply(
            ephemeralCard(
              makeErrorCard(
                "Role Gone",
                "You don't have a custom role anymore.",
              ),
            ),
          );
          return;
        }
        const deleted = await deleteBoosterRole(
          services,
          guildId,
          owned.record,
          config,
          "deleted by the owner",
        );
        if (!deleted) {
          await interaction.editReply(
            ephemeralCard(
              makeErrorCard(
                "Role Not Deleted",
                "Nothing was removed. Ask an administrator to check my role hierarchy and try again.",
              ),
            ),
          );
          return;
        }
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(
              "Role Deleted",
              "Your custom role has been removed.",
            ),
          ),
        );
        return;
      }
      case "delete-cancel": {
        if (!interaction.isButton()) return;
        await deferComponent(interaction);
        const owned = await loadOwnedRole(
          services,
          guildId,
          interaction.user.id,
        );
        if (!owned) {
          await interaction.editReply(
            ephemeralCard(
              makeErrorCard(
                "Role Gone",
                "You don't have a custom role anymore.",
              ),
            ),
          );
          return;
        }
        await interaction.editReply(
          ephemeralCard(
            noPingCard(
              buildOwnerPanel(owned.record, owned.role, config),
            ),
          ),
        );
        return;
      }
      case "shared-page": {
        if (!interaction.isButton()) return;
        await deferComponent(interaction);
        const shared = await loadSharedRoles(
          services,
          guildId,
          interaction.user.id,
        );
        if (shared.length === 0) {
          await interaction.editReply(
            ephemeralCard(
              makeErrorCard(
                "Role Gone",
                "You don't have any shared booster roles anymore.",
              ),
            ),
          );
          return;
        }
        const views: SharedRoleView[] = shared.map(({ record, role }) => ({
          roleId: record.roleId,
          ownerId: record.ownerId,
          name: role.name,
        }));
        const page = Number.parseInt(parsed.rest[1] ?? "0", 10);
        const guild = await resolveGuild(services, guildId);
        const member = guild
          ? await fetchMember(guild, interaction.user.id)
          : null;
        await interaction.editReply(
          ephemeralCard(
            noPingCard(
              buildSharedPanel(
                interaction.user.id,
                views,
                Boolean(member && isEligible(member, config)),
                Number.isFinite(page) ? page : 0,
              ),
            ),
          ),
        );
        return;
      }
      case "panel": {
        if (!interaction.isButton()) return;
        await deferComponent(interaction);
        const owned = await loadOwnedRole(
          services,
          guildId,
          interaction.user.id,
        );
        if (owned) {
          await interaction.editReply(
            ephemeralCard(
              noPingCard(
                buildOwnerPanel(owned.record, owned.role, config),
              ),
            ),
          );
          return;
        }
        const shared = await loadSharedRoles(
          services,
          guildId,
          interaction.user.id,
        );
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
          await interaction.editReply(
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
          await interaction.editReply(
            ephemeralCard(
              noPingCard(buildSharedPanel(interaction.user.id, views)),
            ),
          );
          return;
        }
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "Role Gone",
              "Your role no longer exists. Run `/boosterrole` again.",
            ),
          ),
        );
        return;
      }
      case "shared": {
        if (!interaction.isButton()) return;
        await deferComponent(interaction);
        const owned = await loadOwnedRole(
          services,
          guildId,
          interaction.user.id,
        );
        if (owned) {
          await interaction.editReply(
            ephemeralCard(
              noPingCard(
                buildOwnerPanel(owned.record, owned.role, config),
              ),
            ),
          );
          return;
        }
        const shared = await loadSharedRoles(
          services,
          guildId,
          interaction.user.id,
        );
        if (shared.length === 0) {
          await interaction.editReply(
            ephemeralCard(
              makeInfoCard(
                "Shared With Me",
                "You don't have any shared booster roles.",
              ),
            ),
          );
          return;
        }
        const views: SharedRoleView[] = shared.map(({ record, role }) => ({
          roleId: record.roleId,
          ownerId: record.ownerId,
          name: role.name,
        }));
        const guild = await resolveGuild(services, guildId);
        const member = guild
          ? await fetchMember(guild, interaction.user.id)
          : null;
        await interaction.editReply(
          ephemeralCard(
            noPingCard(
              buildSharedPanel(
                interaction.user.id,
                views,
                Boolean(member && isEligible(member, config)),
              ),
            ),
          ),
        );
        return;
      }
      case "modal-create":
        await handleCreateModal(interaction, services, guildId, config);
        return;
      case "modal-rename":
        await handleRenameModal(interaction, services, guildId, config);
        return;
      case "modal-color":
        await handleColorModal(interaction, services, guildId, config);
        return;
      default:
        return;
    }
  } catch (error) {
    services.observability?.logger?.error?.("booster role interaction failed", {
      error,
      customId: interaction.customId,
    });
    const card = ephemeralCard(
      makeErrorCard(
        "Something Went Wrong",
        "That action couldn't be completed. Try again.",
      ),
    );
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(card).catch(() => undefined);
    } else if (interaction.isRepliable()) {
      await interaction.reply(card).catch(() => undefined);
    }
  }
}
