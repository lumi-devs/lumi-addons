import { defineCommand, type CommandContext } from "lumi/commands";
import { getBoosterConfig } from "../lib/config.js";
import {
  addBlacklist,
  deleteBoosterRole,
  getRole,
  isBlacklisted,
  listBlacklist,
  listRoles,
  removeBlacklist,
} from "../lib/data.js";
import { accessDenial } from "../lib/access.js";
import { buildPanel } from "../lib/ui.js";

const ACTION_CHOICES = [
  { name: "stats", value: "stats" },
  { name: "list", value: "list" },
  { name: "info", value: "info" },
  { name: "delete", value: "delete" },
  { name: "blacklist", value: "blacklist" },
];

const BLACKLIST_CHOICES = [
  { name: "add", value: "add" },
  { name: "remove", value: "remove" },
  { name: "list", value: "list" },
];

function relative(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

export default defineCommand({
  name: "boosterroles",
  description: "Create, manage, or administer custom booster roles.",
  build: () => ({
    name: "boosterroles",
    description: "Create, manage, or administer custom booster roles.",
    options: [
      {
        type: 3,
        name: "action",
        description: "Admin action (optional — leave empty for personal role controls).",
        required: false,
        choices: ACTION_CHOICES,
      },
      {
        type: 6,
        name: "user",
        description: "Target user for admin actions.",
        required: false,
      },
      {
        type: 3,
        name: "reason",
        description: "Reason for delete or blacklist add.",
        required: false,
      },
      {
        type: 3,
        name: "blacklist_action",
        description: "Blacklist operation (add, remove, list).",
        required: false,
        choices: BLACKLIST_CHOICES,
      },
    ],
  }),
  run: async (ctx: CommandContext) => {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This command only works inside a server.");
    const guildId = ctx.guildId;

    const action = await ctx.getString("action");
    if (!action) return runPanel(ctx, guildId);

    if (!(await isMod(ctx))) {
      return ctx.replyError("Permission Denied", "This action is restricted to moderators.");
    }

    switch (action) {
      case "stats":
        return runStats(ctx, guildId);
      case "list":
        return runList(ctx, guildId);
      case "info":
        return runInfo(ctx, guildId);
      case "delete":
        return runDelete(ctx, guildId);
      case "blacklist":
        return runBlacklist(ctx, guildId);
      default:
        return ctx.replyError("Error", "Invalid action specified.");
    }
  },
});

async function isMod(ctx: CommandContext): Promise<boolean> {
  for (const node of ["mod.*", "admin.*", "boosterroles.admin"]) {
    try {
      await ctx.checkPermit(node);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function runPanel(ctx: CommandContext, guildId: string): Promise<void> {
  const config = await getBoosterConfig(guildId);
  const role = await getRole(guildId, ctx.user.id);

  const denial = await accessDenial(guildId, ctx.user.id, config);
  if (denial) {
    const blocked = denial === "You're blacklisted from using custom roles here.";
    if (!role || blocked) {
      if (blocked) return ctx.replyWarning("Blocked", denial);
      return ctx.replyWarning("Boosters Only", denial);
    }
  }

  return ctx.reply(buildPanel(role));
}

async function runStats(ctx: CommandContext, guildId: string): Promise<void> {
  const [roles, blacklist] = await Promise.all([listRoles(guildId), listBlacklist(guildId)]);
  const shares = roles.reduce((n, r) => n + r.sharedWith.length, 0);
  return ctx.replyInfo(
    "📊 Booster Roles",
    [`**Custom roles:** ${roles.length}`, `**Active shares:** ${shares}`, `**Blacklisted:** ${blacklist.length}`].join(
      "\n",
    ),
  );
}

const PAGE_SIZE = 10;

async function runList(ctx: CommandContext, guildId: string): Promise<void> {
  const roles = await listRoles(guildId);
  if (roles.length === 0) return ctx.replyInfo("Custom Roles", "No custom roles yet.");
  const lines = roles
    .slice(0, PAGE_SIZE)
    .map((r) => `<@&${r.roleId}> — <@${r.ownerId}>${r.sharedWith.length ? ` (+${r.sharedWith.length} shared)` : ""}`);
  if (roles.length > PAGE_SIZE) lines.push(`*…and ${roles.length - PAGE_SIZE} more.*`);
  return ctx.replyInfo("Custom Roles", lines.join("\n"));
}

async function runInfo(ctx: CommandContext, guildId: string): Promise<void> {
  const target = await ctx.getUser("user");
  if (!target) return ctx.replyError("Error", "Please specify a target user.");
  const role = await getRole(guildId, target.id);
  if (!role) return ctx.replyError("Error", `<@${target.id}> has no custom role.`);

  return ctx.replyInfo(
    "🎨 Custom Role",
    [
      `**Owner:** <@${role.ownerId}>`,
      `**Role:** <@&${role.roleId}>`,
      `**Name:** ${role.name}`,
      `**Colour:** \`${role.color ?? "default"}\``,
      ...(role.icon ? [`**Icon:** ${role.icon}`] : []),
      `**Shared with:** ${role.sharedWith.length ? role.sharedWith.map((id) => `<@${id}>`).join(", ") : "*no one*"}`,
    ].join("\n"),
  );
}

async function runDelete(ctx: CommandContext, guildId: string): Promise<void> {
  const target = await ctx.getUser("user");
  if (!target) return ctx.replyError("Error", "Please specify a target user.");
  const reason = (await ctx.getString("reason")) ?? "No reason given";
  const role = await getRole(guildId, target.id);
  if (!role) return ctx.replyError("Error", `<@${target.id}> has no custom role.`);

  const config = await getBoosterConfig(guildId);
  await deleteBoosterRole(guildId, role, config, `deleted by a moderator (${reason})`);
  return ctx.replySuccess("Role Deleted", `Removed <@${target.id}>'s custom role.`);
}

async function runBlacklist(ctx: CommandContext, guildId: string): Promise<void> {
  const blacklistAction = await ctx.getString("blacklist_action");
  if (!blacklistAction) {
    return ctx.replyError("Error", "Please specify a blacklist_action (add, remove, list).");
  }

  if (blacklistAction === "list") {
    const rows = await listBlacklist(guildId);
    if (rows.length === 0) return ctx.replyInfo("Blacklist", "Nobody is blacklisted.");
    const lines = rows
      .slice(0, PAGE_SIZE)
      .map(
        (r) =>
          `<@${r.userId}> — ${relative(r.record.at)} by <@${r.record.by}>${r.record.reason ? ` · ${r.record.reason}` : ""}`,
      );
    if (rows.length > PAGE_SIZE) lines.push(`*…and ${rows.length - PAGE_SIZE} more.*`);
    return ctx.replyInfo("Blacklist", lines.join("\n"));
  }

  const target = await ctx.getUser("user");
  if (!target) return ctx.replyError("Error", "Specify a user for add / remove.");

  if (blacklistAction === "add") {
    if (await isBlacklisted(guildId, target.id)) {
      return ctx.replyError("Error", `<@${target.id}> is already blacklisted.`);
    }
    const reason = (await ctx.getString("reason")) ?? undefined;
    await addBlacklist(guildId, target.id, ctx.user.id, reason);

    const config = await getBoosterConfig(guildId);
    const role = await getRole(guildId, target.id);
    if (role) {
      await deleteBoosterRole(guildId, role, config, "the owner was blacklisted");
    }
    return ctx.replySuccess("Blacklisted", `<@${target.id}> can no longer use custom roles.`);
  }

  if (blacklistAction === "remove") {
    const removed = await removeBlacklist(guildId, target.id);
    if (removed === 0) return ctx.replyError("Error", `<@${target.id}> is not blacklisted.`);
    return ctx.replySuccess("Removed", `<@${target.id}> can use custom roles again.`);
  }

  return ctx.replyError("Error", "Invalid blacklist_action specified.");
}
