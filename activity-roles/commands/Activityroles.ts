import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import {
  makeSuccessCard,
  makeInfoCard,
} from "#src/lib/ui/Cards.js";
import {
  VALID_ACTIVITY_TYPES,
} from "../utilities/Matcher.js";
import {
  addMapping,
  getMappings,
  mappingId,
  removeMapping,
} from "../utilities/Store.js";

const TYPE_CHOICES = VALID_ACTIVITY_TYPES.map((t) => ({ name: t, value: t }));
const VALID_TYPES_LIST = VALID_ACTIVITY_TYPES.join("`, `");

async function add(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const typeArg = await ctx.getString("type");
  const matchString = await ctx.getString("match");
  const role = await ctx.getRole("role");
  if (!typeArg || !matchString || !role) {
    await ctx.replyError(
      "Missing Arguments",
      "Usage: `/activityroles add <type> <match> <role>`.",
    );
    return;
  }
  const type = VALID_ACTIVITY_TYPES.find(
    (t) => t.toLowerCase() === typeArg.toLowerCase(),
  );
  if (!type) {
    await ctx.replyError(
      "Invalid Type",
      `Valid types: \`${VALID_TYPES_LIST}\`.`,
    );
    return;
  }
  await addMapping(ctx.services, ctx.guildId!, type, matchString, role.id);
  await ctx.reply(
    makeSuccessCard(
      "Activity Role Added",
      `Users who are **${type}** matching \`${matchString}\` will receive <@&${role.id}>.`,
    ),
  );
}

async function remove(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const typeArg = await ctx.getString("type");
  const matchString = await ctx.getString("match");
  if (!typeArg || !matchString) {
    await ctx.replyError("Missing Arguments", "Usage: `/activityroles remove <type> <match>`.");
    return;
  }
  const id = mappingId(typeArg, matchString);
  const removed = await removeMapping(ctx.services, ctx.guildId!, id);
  if (!removed) {
    await ctx.replyError(
      "Not Found",
      `No mapping found for type \`${typeArg}\` and match \`${matchString}\`.`,
    );
    return;
  }
  await ctx.reply(
    makeSuccessCard(
      "Activity Role Removed",
      `Removed mapping for **${typeArg}** (\`${matchString}\`).`,
    ),
  );
}

async function list(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const mappings = await getMappings(ctx.services, ctx.guildId!);
  if (mappings.length === 0) {
    await ctx.reply(
      makeInfoCard("Activity Roles", "No activity roles configured for this server."),
    );
    return;
  }
  const lines = mappings.map(
    (m) => `**${m.type}** (\`${m.match}\`) -> <@&${m.roleId}>`,
  );
  await ctx.reply(makeInfoCard("Activity Roles", lines.join("\n")));
}

export const activityrolesDef: CommandDef = {
  name: "activityroles",
  module: "activity-roles",
  description: "Configure activity-based role assignment.",
  guildOnly: true,
  requiredPermit: "mod.*",
  build: () =>
    new SlashCommandBuilder()
      .setName("activityroles")
      .setDescription("Configure activity-based role assignment.")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add an activity role mapping")
          .addStringOption((opt) =>
            opt
              .setName("type")
              .setDescription("Activity type")
              .setRequired(true)
              .addChoices(...TYPE_CHOICES),
          )
          .addStringOption((opt) =>
            opt
              .setName("match")
              .setDescription("Substring to match in the activity name or status")
              .setRequired(true),
          )
          .addRoleOption((opt) =>
            opt.setName("role").setDescription("Role to assign").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove an activity role mapping")
          .addStringOption((opt) =>
            opt
              .setName("type")
              .setDescription("Activity type")
              .setRequired(true)
              .addChoices(...TYPE_CHOICES),
          )
          .addStringOption((opt) =>
            opt
              .setName("match")
              .setDescription("Match string to remove")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List all activity role mappings"),
      ),
  handlers: { add, remove, list },
  defaultSub: "list",
};
