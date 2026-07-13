import { ApplyOptions } from "@sapphire/decorators";
import type { Subcommand } from "@sapphire/plugin-subcommands";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeInfoCard, makeSuccessCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { relativeTimestamp } from "#utilities/time.js";
import { MODULE_NAME } from "../lib/keys.js";
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

@ApplyOptions<BaseSubcommand.Options>({
  name: "roleprotect",
  aliases: ["rp", "rprotect"],
  description: "Manage role mention protection.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: MODULE_NAME,
  permissionLevel: PermissionLevel.ADMIN,
  prefixEnabled: true,
  subcommands: [
    { name: "add", run: "add" },
    { name: "remove", run: "remove" },
    { name: "list", run: "list", default: true },
    { name: "block", run: "block" },
    { name: "unblock", run: "unblock" },
  ],
})
export class RoleProtectCommand extends BaseSubcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Add a role to the protected list.")
            .addRoleOption((o) =>
              o
                .setName("role")
                .setDescription("The role to protect")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("duration")
                .setDescription("Block duration (e.g. 2h, 90m)")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Remove a role from the protected list.")
            .addRoleOption((o) =>
              o
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
            .addRoleOption((o) =>
              o
                .setName("role")
                .setDescription("The role to block")
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("duration")
                .setDescription("Block duration (e.g. 2h, 90m)")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("unblock")
            .setDescription("Manually lift a role mention block.")
            .addRoleOption((o) =>
              o
                .setName("role")
                .setDescription("The role to unblock")
                .setRequired(true),
            ),
        ),
    );
  }

  // --- Subcommands ---

  public async add(ctx: CommandContext) {
    const role = (await ctx.getRole("role", { required: true }))!;
    const rawDuration = await ctx.getString("duration");

    let resolvedDuration: number | null = null;
    if (rawDuration) {
      resolvedDuration = parseMinutes(rawDuration);
      if (resolvedDuration === null) {
        return ctx.replyError(
          "Invalid Duration",
          "Use a value like `90m`, `2h`, or `1d`.",
        );
      }
    } else {
      const configured = await this.container.db.config.getModuleConfig(
        ctx.guildId!,
        MODULE_NAME,
        "default_duration",
      );
      resolvedDuration =
        typeof configured === "number" && configured > 0
          ? configured
          : DEFAULT_FALLBACK_MINUTES;
    }

    await setProtectedRole(ctx.guildId!, role.id, resolvedDuration);
    return ctx.reply(
      makeSuccessCard(
        "Role Protected",
        `${roleLabel(ctx.guild!, role.id)} will be blocked for **${formatMinutes(resolvedDuration)}** whenever it is mentioned.`,
      ),
    );
  }

  public async remove(ctx: CommandContext) {
    const role = (await ctx.getRole("role", { required: true }))!;
    const removed = await removeProtectedRole(ctx.guildId!, role.id);
    if (!removed) {
      return ctx.replyError(
        "Not Protected",
        `${roleLabel(ctx.guild!, role.id)} is not in the protected list.`,
      );
    }
    return ctx.reply(
      makeSuccessCard(
        "Protection Removed",
        `${roleLabel(ctx.guild!, role.id)} is no longer auto-protected.`,
      ),
    );
  }

  public async list(ctx: CommandContext) {
    const { guild } = ctx;
    if (!guild) return;
    const [protectedRoles, blocks] = await Promise.all([
      getProtectedRoles(guild.id),
      getBlocks(guild.id),
    ]);

    const protectedLines =
      protectedRoles.size > 0
        ? [...protectedRoles.entries()].map(
            ([roleId, minutes]) =>
              `${Emojis.BULLET} ${roleLabel(guild, roleId)} — ${formatMinutes(minutes)}`,
          )
        : ["*None configured.*"];

    const blockLines =
      blocks.size > 0
        ? [...blocks.values()].map(
            (b) =>
              `${Emojis.LOCK} ${roleLabel(guild, b.roleId, b.roleName)} — expires ${relativeTimestamp(b.expiresAt)} (${formatRemaining(b.expiresAt)} left)`,
          )
        : ["*No active blocks.*"];

    return ctx.reply(
      makeInfoCard(`${Emojis.SHIELD} Role Mention Protection`, [
        `**Protected roles (${protectedRoles.size})**\n${protectedLines.join("\n")}`,
        `**Active blocks (${blocks.size})**\n${blockLines.join("\n")}`,
      ]),
    );
  }

  public async block(ctx: CommandContext) {
    const { guild } = ctx;
    if (!guild) return;
    const role = (await ctx.getRole("role", { required: true }))!;
    if (await getBlock(guild.id, role.id)) {
      return ctx.replyError(
        "Already Blocked",
        `${roleLabel(guild, role.id)} is already actively blocked.`,
      );
    }

    const rawDuration = await ctx.getString("duration");
    let resolvedDuration: number | null = null;
    if (rawDuration) {
      resolvedDuration = parseMinutes(rawDuration);
      if (resolvedDuration === null) {
        return ctx.replyError(
          "Invalid Duration",
          "Use a value like `90m`, `2h`, or `1d`.",
        );
      }
    } else {
      const configured = await this.container.db.config.getModuleConfig(
        guild.id,
        MODULE_NAME,
        "default_duration",
      );
      resolvedDuration =
        typeof configured === "number" && configured > 0
          ? configured
          : DEFAULT_FALLBACK_MINUTES;
    }

    const block = await applyBlock(guild, role, resolvedDuration, true);
    return ctx.reply(
      makeSuccessCard(
        "Role Blocked",
        `Mentions of ${roleLabel(guild, role.id)} are blocked until ${relativeTimestamp(block.expiresAt)}.`,
      ),
    );
  }

  public async unblock(ctx: CommandContext) {
    const { guild } = ctx;
    if (!guild) return;
    const role = (await ctx.getRole("role", { required: true }))!;
    const lifted = await liftBlock(guild, role.id, "manual");
    if (!lifted) {
      return ctx.replyError(
        "Not Blocked",
        `${roleLabel(guild, role.id)} is not currently blocked.`,
      );
    }
    return ctx.reply(
      makeSuccessCard(
        "Block Lifted",
        `Mentions of ${roleLabel(guild, role.id)} are allowed again.`,
      ),
    );
  }
}
