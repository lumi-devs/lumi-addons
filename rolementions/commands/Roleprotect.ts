import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { makeInfoCard, makeSuccessCard } from "@lumi-devs/lumi/ui";
import { MODULE_NAME } from "../utilities/Keys.js";
import {
  getBlock,
  getBlocks,
  getProtectedRoles,
  removeProtectedRole,
  setProtectedRole,
} from "../utilities/Store.js";
import { applyBlock, liftBlock } from "../utilities/Protection.js";
import {
  formatMinutes,
  formatRemaining,
  parseMinutes,
  roleLabel,
} from "../utilities/Format.js";

const DEFAULT_FALLBACK_MINUTES = 120;

interface RoleRef {
  id: string;
  name?: string;
}

async function resolveDuration(ctx: CommandContext): Promise<number | null> {
  const rawDuration = await ctx.getString("duration");
  if (rawDuration) {
    const parsed = parseMinutes(rawDuration);
    if (parsed === null) {
      await ctx.replyError(
        "Invalid Duration",
        "Use a value like `90m`, `2h`, or `1d`.",
      );
      return null;
    }
    return parsed;
  }
  return DEFAULT_FALLBACK_MINUTES;
}

async function readRole(ctx: CommandContext): Promise<RoleRef | null> {
  const ref = await ctx.getRole("role");
  if (!ref) {
    await ctx.replyError("Invalid Role", "Pick a role from the menu.");
    return null;
  }
  return ref;
}

async function add(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const role = await readRole(ctx);
  if (!role) return;
  const duration = await resolveDuration(ctx);
  if (duration === null) return;

  await setProtectedRole(ctx.services, guildId, role.id, duration);
  await ctx.reply(
    makeSuccessCard(
      "Role Protected",
      `${roleLabel(role.id, role.name)} will be blocked for **${formatMinutes(duration)}** whenever it is mentioned.`,
    ),
  );
}

async function remove(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const role = await readRole(ctx);
  if (!role) return;
  const removed = await removeProtectedRole(ctx.services, guildId, role.id);
  if (!removed) {
    await ctx.replyError(
      "Not Protected",
      `${roleLabel(role.id, role.name)} is not in the protected list.`,
    );
    return;
  }
  await ctx.reply(
    makeSuccessCard(
      "Protection Removed",
      `${roleLabel(role.id, role.name)} is no longer auto-protected.`,
    ),
  );
}

async function list(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const [protectedRoles, blocks] = await Promise.all([
    getProtectedRoles(ctx.services, guildId),
    getBlocks(ctx.services, guildId),
  ]);

  const protectedLines =
    protectedRoles.size > 0
      ? [...protectedRoles.entries()].map(
          ([roleId, minutes]) =>
            `⚡ ${roleLabel(roleId)} - ${formatMinutes(minutes)}`,
        )
      : ["*None configured.*"];

  const blockLines =
    blocks.size > 0
      ? [...blocks.values()].map(
          (b) =>
            `🔒 ${roleLabel(b.roleId, b.roleName)} - expires <t:${Math.floor(b.expiresAt / 1000)}:R> (${formatRemaining(b.expiresAt)} left)`,
        )
      : ["*No active blocks.*"];

  await ctx.reply(
    makeInfoCard("🛡️ Role Mention Protection", [
      `**Protected roles (${protectedRoles.size})**\n${protectedLines.join("\n")}`,
      `**Active blocks (${blocks.size})**\n${blockLines.join("\n")}`,
    ]),
  );
}

async function block(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const role = await readRole(ctx);
  if (!role) return;
  if (await getBlock(ctx.services, guildId, role.id)) {
    await ctx.replyError(
      "Already Blocked",
      `${roleLabel(role.id, role.name)} is already actively blocked.`,
    );
    return;
  }
  const duration = await resolveDuration(ctx);
  if (duration === null) return;

  const result = await applyBlock(
    ctx.services,
    guildId,
    role.id,
    duration,
    true,
    role.name,
  );
  await ctx.reply(
    makeSuccessCard(
      "Role Blocked",
      `Mentions of ${roleLabel(role.id, role.name)} are blocked until <t:${Math.floor(result.expiresAt / 1000)}:R>.`,
    ),
  );
}

async function unblock(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const role = await readRole(ctx);
  if (!role) return;
  const lifted = await liftBlock(ctx.services, guildId, role.id, "manual");
  if (!lifted) {
    await ctx.replyError(
      "Not Blocked",
      `${roleLabel(role.id, role.name)} is not currently blocked.`,
    );
    return;
  }
  await ctx.reply(
    makeSuccessCard(
      "Block Lifted",
      `Mentions of ${roleLabel(role.id, role.name)} are allowed again.`,
    ),
  );
}

export const roleprotectDef: CommandDef = {
  name: "roleprotect",
  module: MODULE_NAME,
  description: "Manage role mention protection.",
  guildOnly: true,
  requiredPermit: "admin.rolementions",
  build: () =>
    new SlashCommandBuilder()
      .setName("roleprotect")
      .setDescription("Manage role mention protection.")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a role to the protected list.")
          .addRoleOption((opt) =>
            opt
              .setName("role")
              .setDescription("The role to protect")
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName("duration")
              .setDescription("Block duration (e.g. 2h, 90m)")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a role from the protected list.")
          .addRoleOption((opt) =>
            opt
              .setName("role")
              .setDescription("The role to unprotect")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("List protected roles and active blocks."),
      )
      .addSubcommand((sub) =>
        sub
          .setName("block")
          .setDescription("Manually block mentions of a role.")
          .addRoleOption((opt) =>
            opt
              .setName("role")
              .setDescription("The role to block")
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName("duration")
              .setDescription("Block duration (e.g. 2h, 90m)")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("unblock")
          .setDescription("Manually lift a role mention block.")
          .addRoleOption((opt) =>
            opt
              .setName("role")
              .setDescription("The role to unblock")
              .setRequired(true),
          ),
      ),
  run: list,
  handlers: { add, remove, list, block, unblock },
  defaultSub: "list",
};
