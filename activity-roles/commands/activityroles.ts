import { ApplyOptions } from "@sapphire/decorators";
import type { Args, ApplicationCommandRegistry } from "@sapphire/framework";
import type { Message, ChatInputCommandInteraction } from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { MODULE_NAME } from "../lib/keys.js";
import { addMapping, getMappings, removeMapping } from "../lib/store.js";

const VALID_TYPES = [
  "Playing",
  "Streaming",
  "Listening",
  "Watching",
  "Custom",
  "Competing",
];

@ApplyOptions<BaseSubcommand.Options>({
  name: "activityroles",
  aliases: ["ar", "actroles"],
  description: "Configure activity-based role assignment.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: MODULE_NAME,
  permissionLevel: PermissionLevel.MOD,
  subcommands: [
    { name: "add", messageRun: "msgAdd", chatInputRun: "chatAdd" },
    { name: "remove", messageRun: "msgRemove", chatInputRun: "chatRemove" },
    {
      name: "list",
      messageRun: "msgList",
      chatInputRun: "chatList",
      default: true,
    },
  ],
})
export class ActivityRolesCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description)
          .addSubcommand((cmd) =>
            cmd
              .setName("add")
              .setDescription("Add a new activity role mapping")
              .addStringOption((opt) =>
                opt
                  .setName("type")
                  .setDescription("The activity type (e.g. Playing, Listening)")
                  .setRequired(true)
                  .addChoices(
                    ...VALID_TYPES.map((t) => ({ name: t, value: t })),
                  ),
              )
              .addStringOption((opt) =>
                opt
                  .setName("match")
                  .setDescription(
                    "The string to match in the activity name or status",
                  )
                  .setRequired(true),
              )
              .addRoleOption((opt) =>
                opt
                  .setName("role")
                  .setDescription("The role to assign")
                  .setRequired(true),
              ),
          )
          .addSubcommand((cmd) =>
            cmd
              .setName("remove")
              .setDescription("Remove an activity role mapping")
              .addStringOption((opt) =>
                opt
                  .setName("type")
                  .setDescription("The activity type")
                  .setRequired(true)
                  .addChoices(
                    ...VALID_TYPES.map((t) => ({ name: t, value: t })),
                  ),
              )
              .addStringOption((opt) =>
                opt
                  .setName("match")
                  .setDescription("The match string to remove")
                  .setRequired(true),
              ),
          )
          .addSubcommand((cmd) =>
            cmd.setName("list").setDescription("List all activity roles"),
          ),
      { idHints: [] },
    );
  }

  // --- Chat Input Run Methods ---

  public async chatAdd(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;
    const typeArg = interaction.options.getString("type", true);
    const matchString = interaction.options.getString("match", true);
    const role = interaction.options.getRole("role", true);

    const type = VALID_TYPES.find(
      (t) => t.toLowerCase() === typeArg.toLowerCase(),
    )!;

    await addMapping(interaction.guildId, type, matchString, role.id);

    return interaction.reply({
      embeds: [
        makeSuccessCard(
          "Activity Role Added",
          `Users who are **${type}** and matching \`${matchString}\` will receive the <@&${role.id}> role.`,
        ),
      ],
    });
  }

  public async chatRemove(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;
    const typeArg = interaction.options.getString("type", true);
    const matchString = interaction.options.getString("match", true);

    const id = `${typeArg.toLowerCase()}:${matchString.toLowerCase()}`;
    const removed = await removeMapping(interaction.guildId, id);

    if (!removed) {
      return interaction.reply({
        embeds: [
          makeErrorCard(
            "Not Found",
            `No activity role mapping found for type \`${typeArg}\` and match string \`${matchString}\`.`,
          ),
        ],
      });
    }

    return interaction.reply({
      embeds: [
        makeSuccessCard(
          "Activity Role Removed",
          `The activity role mapping for **${typeArg}** (\`${matchString}\`) has been removed.`,
        ),
      ],
    });
  }

  public async chatList(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;

    const mappings = await getMappings(interaction.guildId);
    if (mappings.length === 0) {
      return interaction.reply({
        embeds: [
          makeInfoCard(
            `${Emojis.GEAR} Activity Roles`,
            "No activity roles are configured for this server.",
          ),
        ],
      });
    }

    const guild = interaction.guild!;
    const lines = mappings.map((m) => {
      const role = guild.roles.cache.get(m.roleId);
      const roleText = role
        ? `<@&${role.id}>`
        : `*(Deleted Role: ${m.roleId})*`;
      return `**${m.type}** (\`${m.match}\`) ${Emojis.ARROW_RIGHT} ${roleText}`;
    });

    return interaction.reply({
      embeds: [makeInfoCard(`${Emojis.GEAR} Activity Roles`, lines.join("\n"))],
    });
  }

  // --- Message Run Methods ---

  public async msgAdd(message: Message, args: Args): Promise<unknown> {
    if (!message.inGuild()) return;
    const { guild } = message;

    const typeArg = await args.pick("string").catch(() => null);
    if (
      !typeArg ||
      !VALID_TYPES.map((t) => t.toLowerCase()).includes(typeArg.toLowerCase())
    ) {
      return message.reply(
        makeErrorCard(
          "Invalid Type",
          `Please provide a valid activity type: \`${VALID_TYPES.join("`, `")}\``,
        ),
      );
    }

    const matchString = await args.pick("string").catch(() => null);
    if (!matchString) {
      return message.reply(
        makeErrorCard(
          "Missing Match String",
          "Please provide the string to match against the activity name or status.",
        ),
      );
    }

    const role = await args.pick("role").catch(() => null);
    if (!role) {
      return message.reply(
        makeErrorCard(
          "Missing Role",
          "Please mention or provide the ID of the role to assign.",
        ),
      );
    }

    // Use proper capitalization
    const type = VALID_TYPES.find(
      (t) => t.toLowerCase() === typeArg.toLowerCase(),
    )!;

    await addMapping(guild.id, type, matchString, role.id);

    return message.reply(
      makeSuccessCard(
        "Activity Role Added",
        `Users who are **${type}** and matching \`${matchString}\` will receive the ${role} role.`,
      ),
    );
  }

  public async msgRemove(message: Message, args: Args): Promise<unknown> {
    if (!message.inGuild()) return;
    const { guild } = message;

    const typeArg = await args.pick("string").catch(() => null);
    const matchString = await args.pick("string").catch(() => null);

    if (!typeArg || !matchString) {
      return message.reply(
        makeErrorCard(
          "Missing Arguments",
          "Usage: `activityroles remove <type> <match_string>`",
        ),
      );
    }

    const id = `${typeArg.toLowerCase()}:${matchString.toLowerCase()}`;
    const removed = await removeMapping(guild.id, id);

    if (!removed) {
      return message.reply(
        makeErrorCard(
          "Not Found",
          `No activity role mapping found for type \`${typeArg}\` and match string \`${matchString}\`.`,
        ),
      );
    }

    return message.reply(
      makeSuccessCard(
        "Activity Role Removed",
        `The activity role mapping for **${typeArg}** (\`${matchString}\`) has been removed.`,
      ),
    );
  }

  public async msgList(message: Message): Promise<unknown> {
    if (!message.inGuild()) return;
    const { guild } = message;

    const mappings = await getMappings(guild.id);
    if (mappings.length === 0) {
      return message.reply(
        makeInfoCard(
          `${Emojis.GEAR} Activity Roles`,
          "No activity roles are configured for this server.",
        ),
      );
    }

    const lines = mappings.map((m) => {
      const role = guild.roles.cache.get(m.roleId);
      const roleText = role
        ? `<@&${role.id}>`
        : `*(Deleted Role: ${m.roleId})*`;
      return `**${m.type}** (\`${m.match}\`) ${Emojis.ARROW_RIGHT} ${roleText}`;
    });

    return message.reply(
      makeInfoCard(`${Emojis.GEAR} Activity Roles`, lines.join("\n")),
    );
  }
}
