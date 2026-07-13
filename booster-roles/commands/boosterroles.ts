import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  roleMention,
  userMention,
  time,
  TimestampStyles,
} from "@discordjs/formatters";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";
import {
  ephemeralCard,
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
  makeWarningCard,
  noPingCard,
} from "#utilities/cards.js";
import { paginateList } from "#utilities/pagination.js";
import { getBoosterConfig } from "../lib/config.js";
import {
  addBlacklist,
  getRole,
  isBlacklisted,
  listBlacklist,
  listRoles,
  removeBlacklist,
} from "../lib/data.js";
import { isEligible } from "../lib/roles.js";
import { buildPanel } from "../lib/ui.js";
import { removeOwnerRole } from "../lib/cleanup.js";
import { colorToHex } from "../lib/engine.js";

@ApplyOptions<BaseCommand.Options>({
  name: "boosterroles",
  description: "Create, manage, or administer custom booster roles.",
  preconditions: ["GuildOnly"],
})
export class BoosterRolesCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((o) =>
          o
            .setName("action")
            .setDescription(
              "Admin action (optional — leave empty for personal role controls).",
            )
            .setRequired(false)
            .addChoices(
              { name: "stats", value: "stats" },
              { name: "list", value: "list" },
              { name: "info", value: "info" },
              { name: "delete", value: "delete" },
              { name: "blacklist", value: "blacklist" },
            ),
        )
        .addUserOption((o) =>
          o
            .setName("user")
            .setDescription("Target user for admin actions.")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Reason for delete or blacklist add.")
            .setRequired(false),
        )
        .addStringOption((o) =>
          o
            .setName("blacklist_action")
            .setDescription("Blacklist operation (add, remove, list).")
            .setRequired(false)
            .addChoices(
              { name: "add", value: "add" },
              { name: "remove", value: "remove" },
              { name: "list", value: "list" },
            ),
        ),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const action = interaction.options.getString("action");

    // If no action is specified, it opens the user panel (personal role controls)
    if (!action) {
      return this.runPanel(interaction);
    }

    // Admin commands require MOD permission level
    if (!(await this.assertMod(interaction))) return;

    switch (action) {
      case "stats":
        return this.runStats(interaction);
      case "list":
        return this.runList(interaction);
      case "info":
        return this.runInfo(interaction);
      case "delete":
        return this.runDelete(interaction);
      case "blacklist":
        return this.runBlacklist(interaction);
      default:
        return this.reply(
          interaction,
          ephemeralCard(
            noPingCard(makeErrorCard("Error", "Invalid action specified.")),
          ),
        );
    }
  }

  private async runPanel(interaction: ChatInputCommandInteraction) {
    const member = await interaction
      .guild!.members.fetch(interaction.user.id)
      .catch(() => null);
    if (!member)
      return this.reply(
        interaction,
        ephemeralCard(
          noPingCard(
            makeErrorCard("Error", "Couldn't resolve your membership."),
          ),
        ),
      );

    const config = await getBoosterConfig(member.guild.id);
    const record = await getRole(member.guild.id, member.id);

    // Blacklisted members are locked out entirely.
    if (await isBlacklisted(member.guild.id, member.id))
      return this.reply(
        interaction,
        ephemeralCard(
          makeWarningCard(
            "Blocked",
            "You're blacklisted from using custom roles here.",
          ),
        ),
      );

    // Non-boosters with no existing role can't do anything useful.
    if (!record && !isEligible(member, config))
      return this.reply(
        interaction,
        ephemeralCard(
          makeWarningCard(
            "Boosters Only",
            "You need to be a server booster to create a custom role. Thanks for considering it!",
          ),
        ),
      );

    return this.reply(interaction, ephemeralCard(buildPanel(record)));
  }

  private async runStats(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guild!.id;
    const [roles, blacklist] = await Promise.all([
      listRoles(guildId),
      listBlacklist(guildId),
    ]);
    const shares = roles.reduce((n, r) => n + r.sharedWith.length, 0);
    return this.reply(
      interaction,
      ephemeralCard(
        makeInfoCard("📊 Booster Roles", [
          `**Custom roles:** ${roles.length}`,
          `**Active shares:** ${shares}`,
          `**Blacklisted:** ${blacklist.length}`,
        ]),
      ),
    );
  }

  private async runList(interaction: ChatInputCommandInteraction) {
    const roles = await listRoles(interaction.guild!.id);
    const lines = roles.map(
      (r) =>
        `${roleMention(r.roleId)} — ${userMention(r.ownerId)}${
          r.sharedWith.length ? ` (+${r.sharedWith.length} shared)` : ""
        }`,
    );
    await paginateList({
      interactionOrMessage: interaction,
      userId: interaction.user.id,
      title: "Custom Roles",
      items: lines,
      perPage: 5,
      ephemeral: true,
    });
  }

  private async runInfo(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guild!.id;
    const user = interaction.options.getUser("user");
    if (!user) {
      return this.err(interaction, "Please specify a target user.");
    }
    const record = await getRole(guildId, user.id);
    if (!record)
      return this.err(
        interaction,
        `${userMention(user.id)} has no custom role.`,
      );

    return this.reply(
      interaction,
      ephemeralCard(
        noPingCard(
          makeInfoCard("🎨 Custom Role", [
            `**Owner:** ${userMention(record.ownerId)}`,
            `**Role:** ${roleMention(record.roleId)}`,
            `**Colour:** \`${colorToHex(record.color)}\``,
            `**Created:** ${time(new Date(record.createdAt), TimestampStyles.RelativeTime)}`,
            `**Shared with:** ${
              record.sharedWith.length
                ? record.sharedWith.map(userMention).join(", ")
                : "*no one*"
            }`,
          ]),
        ),
      ),
    );
  }

  private async runDelete(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const user = interaction.options.getUser("user");
    if (!user) {
      return this.err(interaction, "Please specify a target user.");
    }
    const reason = interaction.options.getString("reason") ?? "No reason given";
    const record = await getRole(guild.id, user.id);
    if (!record)
      return this.err(
        interaction,
        `${userMention(user.id)} has no custom role.`,
      );

    const config = await getBoosterConfig(guild.id);
    await removeOwnerRole(
      guild,
      record,
      `Admin delete by ${interaction.user.tag}: ${reason}`,
      config,
      `deleted by a moderator (${reason})`,
    );
    return this.reply(
      interaction,
      ephemeralCard(
        makeSuccessCard(
          "Role Deleted",
          `Removed ${userMention(user.id)}'s custom role.`,
        ),
      ),
    );
  }

  private async runBlacklist(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guild!.id;
    const blacklistAction = interaction.options.getString("blacklist_action");
    if (!blacklistAction) {
      return this.err(
        interaction,
        "Please specify a blacklist_action (add, remove, list).",
      );
    }

    if (blacklistAction === "list") {
      const rows = await listBlacklist(guildId);
      const lines = rows.map(
        (r) =>
          `${userMention(r.userId)} — ${time(new Date(r.record.at), TimestampStyles.RelativeTime)} by ${userMention(r.record.by)}${
            r.record.reason ? ` · ${r.record.reason}` : ""
          }`,
      );
      await paginateList({
        interactionOrMessage: interaction,
        userId: interaction.user.id,
        title: "Blacklist",
        items: lines,
        perPage: 5,
        ephemeral: true,
      });
      return;
    }

    const user = interaction.options.getUser("user");
    if (!user) return this.err(interaction, "Specify a user for add / remove.");

    if (blacklistAction === "add") {
      if (await isBlacklisted(guildId, user.id))
        return this.err(
          interaction,
          `${userMention(user.id)} is already blacklisted.`,
        );
      const reason = interaction.options.getString("reason") ?? undefined;
      await addBlacklist(guildId, user.id, interaction.user.id, reason);

      // If they currently own a role, retire it too.
      const record = await getRole(guildId, user.id);
      if (record) {
        const config = await getBoosterConfig(guildId);
        await removeOwnerRole(
          interaction.guild!,
          record,
          `Blacklisted by ${interaction.user.tag}`,
          config,
          "the owner was blacklisted",
        );
      }
      return this.reply(
        interaction,
        ephemeralCard(
          makeSuccessCard(
            "Blacklisted",
            `${userMention(user.id)} can no longer use custom roles.`,
          ),
        ),
      );
    }

    // remove
    const removed = await removeBlacklist(guildId, user.id);
    if (removed === 0)
      return this.err(
        interaction,
        `${userMention(user.id)} is not blacklisted.`,
      );
    return this.reply(
      interaction,
      ephemeralCard(
        makeSuccessCard(
          "Removed",
          `${userMention(user.id)} can use custom roles again.`,
        ),
      ),
    );
  }

  private async assertMod(
    interaction: ChatInputCommandInteraction,
  ): Promise<boolean> {
    const level = await resolvePermissionLevel(interaction);
    if (level < PermissionLevel.MOD) {
      await this.reply(
        interaction,
        ephemeralCard(
          noPingCard(
            makeErrorCard(
              "Permission Denied",
              "This action is restricted to moderators.",
            ),
          ),
        ),
      );
      return false;
    }
    return true;
  }

  private err(interaction: ChatInputCommandInteraction, message: string) {
    return this.reply(
      interaction,
      ephemeralCard(noPingCard(makeErrorCard("Error", message))),
    );
  }
}
