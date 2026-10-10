import { defineCommand, type CommandContext } from "lumi/commands";
import { makeInfoCard, makeSuccessCard } from "lumi/ui";
import { VALID_ACTIVITY_TYPES } from "../lib/matcher.js";
import { addMapping, getMappings, mappingId, removeMapping } from "../lib/store.js";

const VALID_TYPES_LIST = VALID_ACTIVITY_TYPES.join("`, `");

async function add(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  if (!ctx.guildId) {
    await ctx.replyError(
      "Guild Only",
      "This command only works inside a server.",
    );
    return;
  }

  const typeArg = await ctx.getString("type");
  const matchString = await ctx.getString("match");
  const role = await ctx.getRole("role");
  if (!typeArg || !matchString || !role) {
    await ctx.replyError(
      "Missing Arguments",
      "Usage: `activityroles add <type> <match> <role>` — e.g. `activityroles add Playing \"League of Legends\" @Gamer`.",
    );
    return;
  }

  const type = VALID_ACTIVITY_TYPES.find(
    (t) => t.toLowerCase() === typeArg.toLowerCase(),
  );
  if (!type) {
    await ctx.replyError(
      "Invalid Type",
      `Please provide a valid activity type: \`${VALID_TYPES_LIST}\`.`,
    );
    return;
  }

  const roleId = role.id;

  await addMapping(ctx.guildId, type, matchString, roleId);

  await ctx.reply(
    makeSuccessCard(
      "Activity Role Added",
      `Users who are **${type}** and matching \`${matchString}\` will receive the <@&${roleId}> role.`,
    ),
  );
}

async function remove(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  if (!ctx.guildId) {
    await ctx.replyError(
      "Guild Only",
      "This command only works inside a server.",
    );
    return;
  }

  const typeArg = await ctx.getString("type");
  const matchString = await ctx.getString("match");
  if (!typeArg || !matchString) {
    await ctx.replyError(
      "Missing Arguments",
      "Usage: `activityroles remove <type> <match>`.",
    );
    return;
  }

  const id = mappingId(typeArg, matchString);
  const removed = await removeMapping(ctx.guildId, id);

  if (!removed) {
    await ctx.replyError(
      "Not Found",
      `No activity role mapping found for type \`${typeArg}\` and match string \`${matchString}\`.`,
    );
    return;
  }

  await ctx.reply(
    makeSuccessCard(
      "Activity Role Removed",
      `The activity role mapping for **${typeArg}** (\`${matchString}\`) has been removed.`,
    ),
  );
}

async function list(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  if (!ctx.guildId) {
    await ctx.replyError(
      "Guild Only",
      "This command only works inside a server.",
    );
    return;
  }

  const mappings = await getMappings(ctx.guildId);
  if (mappings.length === 0) {
    await ctx.reply(
      makeInfoCard(
        "⚙️ Activity Roles",
        "No activity roles are configured for this server.",
      ),
    );
    return;
  }

  const lines = mappings.map(
    (m) =>
      `**${m.type}** (\`${m.match}\`) ➡️ <@&${m.roleId}>`,
  );

  await ctx.reply(
    makeInfoCard("⚙️ Activity Roles", lines.join("\n")),
  );
}

const TYPE_CHOICES = VALID_ACTIVITY_TYPES.map((t) => ({ name: t, value: t }));

export default defineCommand({
  name: "activityroles",
  description: "Configure activity-based role assignment.",
  build: () => ({
    name: "activityroles",
    description: "Configure activity-based role assignment.",
    options: [
      {
        type: 1,
        name: "add",
        description: "Add a new activity role mapping",
        options: [
          {
            type: 3,
            name: "type",
            description: "The activity type (e.g. Playing, Listening)",
            required: true,
            choices: TYPE_CHOICES,
          },
          {
            type: 3,
            name: "match",
            description: "The string to match in the activity name or status",
            required: true,
          },
          {
            type: 8,
            name: "role",
            description: "The role to assign",
            required: true,
          },
        ],
      },
      {
        type: 1,
        name: "remove",
        description: "Remove an activity role mapping",
        options: [
          {
            type: 3,
            name: "type",
            description: "The activity type",
            required: true,
            choices: TYPE_CHOICES,
          },
          {
            type: 3,
            name: "match",
            description: "The match string to remove",
            required: true,
          },
        ],
      },
      {
        type: 1,
        name: "list",
        description: "List all activity roles",
      },
    ],
  }),
  run: async (ctx: CommandContext) => {
    const sub = (
      ctx.subcommand ??
      (await ctx.getString("subcommand")) ??
      "list"
    ).toLowerCase();
    if (sub === "add") return add(ctx);
    if (sub === "remove") return remove(ctx);
    return list(ctx);
  },
  handlers: {
    add,
    remove,
    list,
  },
});
