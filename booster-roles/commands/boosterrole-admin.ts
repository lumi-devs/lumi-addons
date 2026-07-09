import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  roleMention,
  userMention,
  time,
  TimestampStyles,
} from "@discordjs/formatters";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  ephemeralCard,
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
  makeListCard,
  noPingCard,
} from "#utilities/cards.js";
import { getBoosterConfig } from "../lib/config.js";
import {
  addBlacklist,
  getRole,
  isBlacklisted,
  listBlacklist,
  listRoles,
  removeBlacklist,
} from "../lib/data.js";
import { removeOwnerRole } from "../lib/cleanup.js";
import { colorToHex } from "../lib/engine.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "boosterrole-admin",
  description: "Administer booster roles.",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
  subcommands: [
    { name: "stats", chatInputRun: "chatInputRunStats" },
    { name: "list", chatInputRun: "chatInputRunList" },
    { name: "info", chatInputRun: "chatInputRunInfo" },
    { name: "delete", chatInputRun: "chatInputRunDelete" },
    { name: "blacklist", chatInputRun: "chatInputRunBlacklist" },
  ],
})
export class BoosterRoleAdminCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s.setName("stats").setDescription("Show booster-role usage totals."),
        )
        .addSubcommand((s) =>
          s
            .setName("list")
            .setDescription("List every custom role and its owner."),
        )
        .addSubcommand((s) =>
          s
            .setName("info")
            .setDescription("Show a member's custom-role details.")
            .addUserOption((o) =>
              o.setName("user").setDescription("The owner.").setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("delete")
            .setDescription("Delete a member's custom role.")
            .addUserOption((o) =>
              o.setName("user").setDescription("The owner.").setRequired(true),
            )
            .addStringOption((o) =>
              o.setName("reason").setDescription("Logged reason (optional)."),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("blacklist")
            .setDescription("Manage the custom-role blacklist.")
            .addStringOption((o) =>
              o
                .setName("action")
                .setDescription("What to do.")
                .setRequired(true)
                .addChoices(
                  { name: "add", value: "add" },
                  { name: "remove", value: "remove" },
                  { name: "list", value: "list" },
                ),
            )
            .addUserOption((o) =>
              o
                .setName("user")
                .setDescription("Target user (for add / remove)."),
            )
            .addStringOption((o) =>
              o.setName("reason").setDescription("Reason (for add)."),
            ),
        ),
    );
  }

  public async chatInputRunStats(interaction: ChatInputCommandInteraction) {
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

  public async chatInputRunList(interaction: ChatInputCommandInteraction) {
    const roles = await listRoles(interaction.guild!.id);
    const lines = roles.map(
      (r) =>
        `${roleMention(r.roleId)} — ${userMention(r.ownerId)}${
          r.sharedWith.length ? ` (+${r.sharedWith.length} shared)` : ""
        }`,
    );
    return this.reply(
      interaction,
      ephemeralCard(noPingCard(makeListCard("Custom Roles", lines))),
    );
  }

  public async chatInputRunInfo(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guild!.id;
    const user = interaction.options.getUser("user", true);
    const record = await getRole(guildId, user.id);
    if (!record)
      return this.#err(
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

  public async chatInputRunDelete(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason") ?? "No reason given";
    const record = await getRole(guild.id, user.id);
    if (!record)
      return this.#err(
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

  public async chatInputRunBlacklist(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guild!.id;
    const action = interaction.options.getString("action", true);

    if (action === "list") {
      const rows = await listBlacklist(guildId);
      const lines = rows.map(
        (r) =>
          `${userMention(r.userId)} — ${time(new Date(r.record.at), TimestampStyles.RelativeTime)} by ${userMention(r.record.by)}${
            r.record.reason ? ` · ${r.record.reason}` : ""
          }`,
      );
      return this.reply(
        interaction,
        ephemeralCard(noPingCard(makeListCard("Blacklist", lines))),
      );
    }

    const user = interaction.options.getUser("user");
    if (!user)
      return this.#err(interaction, "Specify a user for add / remove.");

    if (action === "add") {
      if (await isBlacklisted(guildId, user.id))
        return this.#err(
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
      return this.#err(
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

  #err(interaction: ChatInputCommandInteraction, message: string) {
    return this.reply(
      interaction,
      ephemeralCard(noPingCard(makeErrorCard("Error", message))),
    );
  }
}
