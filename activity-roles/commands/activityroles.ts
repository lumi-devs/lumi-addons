import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { roleMention } from "discord.js";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeInfoCard, makeSuccessCard } from "#utilities/cards.js";
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
  prefixEnabled: true,
  subcommands: [
    { name: "add", run: "add" },
    { name: "remove", run: "remove" },
    {
      name: "list",
      run: "list",
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

  // --- Subcommands ---

  public async add(ctx: CommandContext) {
    const typeArg = (await ctx.getString("type", { required: true }))!;
    const matchString = (await ctx.getString("match", { required: true }))!;
    const role = (await ctx.getRole("role", { required: true }))!;

    const type = VALID_TYPES.find(
      (t) => t.toLowerCase() === typeArg.toLowerCase(),
    );

    if (!type) {
      return ctx.replyError(
        "Invalid Type",
        `Please provide a valid activity type: \`${VALID_TYPES.join("`, `")}\``,
      );
    }

    await addMapping(ctx.guildId!, type, matchString, role.id);

    return ctx.reply(
      makeSuccessCard(
        "Activity Role Added",
        `Users who are **${type}** and matching \`${matchString}\` will receive the ${roleMention(role.id)} role.`,
      ),
    );
  }

  public async remove(ctx: CommandContext) {
    const typeArg = (await ctx.getString("type", { required: true }))!;
    const matchString = (await ctx.getString("match", { required: true }))!;

    const id = `${typeArg.toLowerCase()}:${matchString.toLowerCase()}`;
    const removed = await removeMapping(ctx.guildId!, id);

    if (!removed) {
      return ctx.replyError(
        "Not Found",
        `No activity role mapping found for type \`${typeArg}\` and match string \`${matchString}\`.`,
      );
    }

    return ctx.reply(
      makeSuccessCard(
        "Activity Role Removed",
        `The activity role mapping for **${typeArg}** (\`${matchString}\`) has been removed.`,
      ),
    );
  }

  public async list(ctx: CommandContext) {
    const mappings = await getMappings(ctx.guildId!);
    if (mappings.length === 0) {
      return ctx.reply(
        makeInfoCard(
          `${Emojis.GEAR} Activity Roles`,
          "No activity roles are configured for this server.",
        ),
      );
    }

    const { guild } = ctx;
    const lines = mappings.map((m) => {
      const roleText = guild?.roles.cache.has(m.roleId)
        ? roleMention(m.roleId)
        : `*(Deleted Role: ${m.roleId})*`;
      return `**${m.type}** (\`${m.match}\`) ${Emojis.ARROW_RIGHT} ${roleText}`;
    });

    return ctx.reply(
      makeInfoCard(`${Emojis.GEAR} Activity Roles`, lines.join("\n")),
    );
  }
}
