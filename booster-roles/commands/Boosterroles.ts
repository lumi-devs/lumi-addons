import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/lib/commands/CommandDef.js";
import type { CommandContext } from "@lumi-devs/lumi/lib/commands/Context.js";
import { getBoosterConfig } from "../utilities/Config.js";
import {
  addBlacklist,
  deleteBoosterRole,
  getRole,
  isBlacklisted,
  listBlacklist,
  listRoles,
  removeBlacklist,
} from "../utilities/Data.js";
import { accessDenial } from "../utilities/Access.js";
import { buildPanel } from "../utilities/Ui.js";
import { MODULE_NAME } from "../utilities/Keys.js";

const PAGE_SIZE = 10;

function relative(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

async function runPanel(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const config = await getBoosterConfig(ctx.services, guildId);
  const role = await getRole(ctx.services, guildId, ctx.user.id);

  const denial = await accessDenial(ctx.services, guildId, ctx.user.id, config);
  if (denial) {
    const blocked = denial === "You're blacklisted from using custom roles here.";
    if (!role || blocked) {
      if (blocked) return ctx.replyWarning("Blocked", denial);
      return ctx.replyWarning("Boosters Only", denial);
    }
  }

  return ctx.reply(buildPanel(role));
}

async function runStats(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const [roles, blacklist] = await Promise.all([
    listRoles(ctx.services, guildId),
    listBlacklist(ctx.services, guildId),
  ]);
  const shares = roles.reduce((n, r) => n + r.sharedWith.length, 0);
  return ctx.replyInfo(
    "📊 Booster Roles",
    [
      `**Custom roles:** ${roles.length}`,
      `**Active shares:** ${shares}`,
      `**Blacklisted:** ${blacklist.length}`,
    ].join("\n"),
  );
}

async function runList(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const roles = await listRoles(ctx.services, guildId);
  if (roles.length === 0) return ctx.replyInfo("Custom Roles", "No custom roles yet.");
  const lines = roles
    .slice(0, PAGE_SIZE)
    .map(
      (r) =>
        `<@&${r.roleId}> — <@${r.ownerId}>${r.sharedWith.length ? ` (+${r.sharedWith.length} shared)` : ""}`,
    );
  if (roles.length > PAGE_SIZE) lines.push(`*…and ${roles.length - PAGE_SIZE} more.*`);
  return ctx.replyInfo("Custom Roles", lines.join("\n"));
}

async function runInfo(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const target = await ctx.getUser("user", { required: true });
  if (!target) return ctx.replyError("Error", "Please specify a target user.");
  const role = await getRole(ctx.services, guildId, target.id);
  if (!role) return ctx.replyError("Error", `<@${target.id}> has no custom role.`);

  return ctx.replyInfo(
    "🎨 Custom Role",
    [
      `**Owner:** <@${role.ownerId}>`,
      `**Role:** <@&${role.roleId}>`,
      `**Name:** ${role.name}`,
      `**Colour:** \`${role.color ?? "default"}\``,
      ...(role.icon ? [`**Icon:** ${role.icon}`] : []),
      `**Shared with:** ${
        role.sharedWith.length
          ? role.sharedWith.map((id) => `<@${id}>`).join(", ")
          : "*no one*"
      }`,
    ].join("\n"),
  );
}

async function runDelete(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const target = await ctx.getUser("user", { required: true });
  if (!target) return ctx.replyError("Error", "Please specify a target user.");
  const reason = (await ctx.getString("reason")) ?? "No reason given";
  const role = await getRole(ctx.services, guildId, target.id);
  if (!role) return ctx.replyError("Error", `<@${target.id}> has no custom role.`);

  const config = await getBoosterConfig(ctx.services, guildId);
  await deleteBoosterRole(
    ctx.services,
    guildId,
    role,
    config,
    `deleted by a moderator (${reason})`,
  );
  return ctx.replySuccess("Role Deleted", `Removed <@${target.id}>'s custom role.`);
}

async function runBlacklistAdd(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const target = await ctx.getUser("user", { required: true });
  if (!target) return ctx.replyError("Error", "Specify a user to blacklist.");

  if (await isBlacklisted(ctx.services, guildId, target.id)) {
    return ctx.replyError("Error", `<@${target.id}> is already blacklisted.`);
  }
  const reason = (await ctx.getString("reason")) ?? undefined;
  await addBlacklist(ctx.services, guildId, target.id, ctx.user.id, reason);

  const config = await getBoosterConfig(ctx.services, guildId);
  const role = await getRole(ctx.services, guildId, target.id);
  if (role) {
    await deleteBoosterRole(
      ctx.services,
      guildId,
      role,
      config,
      "the owner was blacklisted",
    );
  }
  return ctx.replySuccess("Blacklisted", `<@${target.id}> can no longer use custom roles.`);
}

async function runBlacklistRemove(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const target = await ctx.getUser("user", { required: true });
  if (!target) return ctx.replyError("Error", "Specify a user to remove from blacklist.");

  const removed = await removeBlacklist(ctx.services, guildId, target.id);
  if (removed === 0) return ctx.replyError("Error", `<@${target.id}> is not blacklisted.`);
  return ctx.replySuccess("Removed", `<@${target.id}> can use custom roles again.`);
}

async function runBlacklistList(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const rows = await listBlacklist(ctx.services, guildId);
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

export const boosterrolesDef: CommandDef = {
  name: "boosterroles",
  module: MODULE_NAME,
  description: "Create, manage, or administer custom booster roles.",
  guildOnly: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("boosterroles")
      .setDescription("Create, manage, or administer custom booster roles.")
      .addSubcommand((sub) =>
        sub.setName("panel").setDescription("Open your personal booster role panel"),
      )
      .addSubcommand((sub) =>
        sub.setName("stats").setDescription("Show booster role statistics"),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List custom booster roles in this server"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("info")
          .setDescription("Inspect a user's custom booster role")
          .addUserOption((opt) =>
            opt.setName("user").setDescription("Target member").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete a user's custom booster role")
          .addUserOption((opt) =>
            opt.setName("user").setDescription("Target member").setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName("reason").setDescription("Reason for deletion"),
          ),
      )
      .addSubcommandGroup((grp) =>
        grp
          .setName("blacklist")
          .setDescription("Manage the booster roles blacklist")
          .addSubcommand((sub) =>
            sub
              .setName("add")
              .setDescription("Blacklist a user from custom booster roles")
              .addUserOption((opt) =>
                opt.setName("user").setDescription("Target member").setRequired(true),
              )
              .addStringOption((opt) =>
                opt.setName("reason").setDescription("Reason for blacklist"),
              ),
          )
          .addSubcommand((sub) =>
            sub
              .setName("remove")
              .setDescription("Remove a user from the blacklist")
              .addUserOption((opt) =>
                opt.setName("user").setDescription("Target member").setRequired(true),
              ),
          )
          .addSubcommand((sub) =>
            sub.setName("list").setDescription("List blacklisted users"),
          ),
      ),
  defaultSub: "panel",
  handlers: {
    panel: {
      guildOnly: true,
      run: runPanel,
    },
    stats: {
      requiredPermit: "admin.boosterroles",
      guildOnly: true,
      run: runStats,
    },
    list: {
      requiredPermit: "admin.boosterroles",
      guildOnly: true,
      run: runList,
    },
    info: {
      requiredPermit: "admin.boosterroles",
      guildOnly: true,
      run: runInfo,
    },
    delete: {
      requiredPermit: "admin.boosterroles",
      guildOnly: true,
      run: runDelete,
    },
    "blacklist:add": {
      requiredPermit: "admin.boosterroles",
      guildOnly: true,
      run: runBlacklistAdd,
    },
    "blacklist:remove": {
      requiredPermit: "admin.boosterroles",
      guildOnly: true,
      run: runBlacklistRemove,
    },
    "blacklist:list": {
      requiredPermit: "admin.boosterroles",
      guildOnly: true,
      run: runBlacklistList,
    },
  },
};
