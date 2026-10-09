import { defineCommand, type CommandContext } from "lumi/commands";
import { Emojis, makeInfoCard, makeSuccessCard } from "lumi/ui";
import { relativeTimestamp } from "lumi/utils";
import {
  getBlock,
  getBlocks,
  getProtectedRoles,
  removeProtectedRole,
  setProtectedRole,
} from "../lib/store.js";
import { applyBlock, liftBlock } from "../lib/protection.js";
import {
  formatMinutes,
  formatRemaining,
  parseMinutes,
  roleLabel,
} from "../lib/format.js";

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
  await ctx.checkPermit("admin.*");
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const role = await readRole(ctx);
  if (!role) return;
  const duration = await resolveDuration(ctx);
  if (duration === null) return;

  await setProtectedRole(guildId, role.id, duration);
  await ctx.reply(
    makeSuccessCard(
      "Role Protected",
      `${roleLabel(role.id, role.name)} will be blocked for **${formatMinutes(duration)}** whenever it is mentioned.`,
    ),
  );
}

async function remove(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("admin.*");
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const role = await readRole(ctx);
  if (!role) return;
  const removed = await removeProtectedRole(guildId, role.id);
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
  await ctx.checkPermit("admin.*");
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const [protectedRoles, blocks] = await Promise.all([
    getProtectedRoles(guildId),
    getBlocks(guildId),
  ]);

  const protectedLines =
    protectedRoles.size > 0
      ? [...protectedRoles.entries()].map(
        ([roleId, minutes]) =>
          `${Emojis.Bullet} ${roleLabel(roleId)} — ${formatMinutes(minutes)}`,
      )
      : ["*None configured.*"];

  const blockLines =
    blocks.size > 0
      ? [...blocks.values()].map(
        (b) =>
          `${Emojis.Lock} ${roleLabel(b.roleId, b.roleName)} — expires ${relativeTimestamp(b.expiresAt)} (${formatRemaining(b.expiresAt)} left)`,
      )
      : ["*No active blocks.*"];

  await ctx.reply(
    makeInfoCard(`${Emojis.Shield} Role Mention Protection`, [
      `**Protected roles (${protectedRoles.size})**\n${protectedLines.join("\n")}`,
      `**Active blocks (${blocks.size})**\n${blockLines.join("\n")}`,
    ]),
  );
}

async function block(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("admin.*");
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const role = await readRole(ctx);
  if (!role) return;
  if (await getBlock(guildId, role.id)) {
    await ctx.replyError(
      "Already Blocked",
      `${roleLabel(role.id, role.name)} is already actively blocked.`,
    );
    return;
  }
  const duration = await resolveDuration(ctx);
  if (duration === null) return;

  const result = await applyBlock(guildId, role.id, duration, true, role.name);
  await ctx.reply(
    makeSuccessCard(
      "Role Blocked",
      `Mentions of ${roleLabel(role.id, role.name)} are blocked until ${relativeTimestamp(result.expiresAt)}.`,
    ),
  );
}

async function unblock(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("admin.*");
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const role = await readRole(ctx);
  if (!role) return;
  const lifted = await liftBlock(guildId, role.id, "manual");
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

const roleOption = (description: string) => ({
  type: 8,
  name: "role",
  description,
  required: true,
});

const durationOption = {
  type: 3,
  name: "duration",
  description: "Block duration (e.g. 2h, 90m)",
  required: false,
};

export default defineCommand({
  name: "roleprotect",
  description: "Manage role mention protection.",
  build: () => ({
    name: "roleprotect",
    description: "Manage role mention protection.",
    options: [
      {
        type: 1,
        name: "add",
        description: "Add a role to the protected list.",
        options: [roleOption("The role to protect"), durationOption],
      },
      {
        type: 1,
        name: "remove",
        description: "Remove a role from the protected list.",
        options: [roleOption("The role to unprotect")],
      },
      {
        type: 1,
        name: "list",
        description: "List protected roles and active blocks.",
      },
      {
        type: 1,
        name: "block",
        description: "Manually block mentions of a role.",
        options: [roleOption("The role to block"), durationOption],
      },
      {
        type: 1,
        name: "unblock",
        description: "Manually lift a role mention block.",
        options: [roleOption("The role to unblock")],
      },
    ],
  }),
  run: list,
  handlers: { add, remove, list, block, unblock },
});
