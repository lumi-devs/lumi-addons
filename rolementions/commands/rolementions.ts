import { ApplyOptions } from "@sapphire/decorators";
import type { Subcommand } from "@sapphire/plugin-subcommands";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeInfoCard, makeSuccessCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { MODULE_NAME } from "../lib/keys.js";
import { getCounts, getRoleCount, resetCounts } from "../lib/store.js";
import { roleLabel } from "../lib/format.js";
import { sendLog } from "../lib/log.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "rolementions",
  aliases: ["rm", "rmention", "rmentions"],
  description: "Role mention statistics for this server.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: MODULE_NAME,
  permissionLevel: PermissionLevel.MOD,
  prefixEnabled: true,
  subcommands: [
    { name: "stats", run: "stats", default: true },
    { name: "top", run: "top" },
    { name: "reset", run: "reset" },
  ],
})
export class RoleMentionsCommand extends BaseSubcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("stats")
            .setDescription("Show mention stats for a role or all roles.")
            .addRoleOption((o) =>
              o
                .setName("role")
                .setDescription("Optional role to filter stats")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("top")
            .setDescription("Show top mentioned roles.")
            .addIntegerOption((o) =>
              o
                .setName("limit")
                .setDescription("Number of roles to show (1-25)")
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("reset")
            .setDescription("Reset all mention counters to zero."),
        ),
    );
  }

  // --- Subcommands ---

  public async stats(ctx: CommandContext) {
    const { guild } = ctx;
    if (!guild) return;

    const role = await ctx.getRole("role");

    if (role) {
      const count = await getRoleCount(guild.id, role.id);
      return ctx.reply(
        makeInfoCard(
          `${Emojis.ANALYTICS} Mention Stats`,
          `${roleLabel(guild, role.id)} was mentioned **${count}** time${count === 1 ? "" : "s"} today.`,
        ),
      );
    }

    const counts = await getCounts(guild.id);
    if (counts.size === 0) {
      return ctx.reply(
        makeInfoCard(
          `${Emojis.ANALYTICS} Mention Stats`,
          "No role mentions recorded yet today.",
        ),
      );
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((acc, [, n]) => acc + n, 0);
    const shown = sorted.slice(0, 15);
    const lines = shown.map(
      ([roleId, n], i) =>
        `**${i + 1}.** ${roleLabel(guild, roleId)} — **${n}**`,
    );

    return ctx.reply(
      makeInfoCard(
        `${Emojis.ANALYTICS} Role Mention Stats`,
        [
          `**Total:** ${total} · **Unique roles:** ${counts.size}`,
          lines.join("\n"),
        ],
        {
          footer:
            sorted.length > shown.length
              ? `Showing top ${shown.length} of ${sorted.length} · resets daily at 00:00 UTC`
              : "Resets daily at 00:00 UTC",
        },
      ),
    );
  }

  public async top(ctx: CommandContext) {
    const { guild } = ctx;
    if (!guild) return;

    const rawLimit = await ctx.getInteger("limit");
    const limit = Math.min(Math.max(rawLimit ?? 5, 1), 25);

    const counts = await getCounts(guild.id);
    if (counts.size === 0) {
      return ctx.reply(
        makeInfoCard(
          `${Emojis.ANALYTICS} Top Roles`,
          "No role mentions recorded yet today.",
        ),
      );
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((acc, [, n]) => acc + n, 0);
    const top = sorted.slice(0, limit);
    const lines = top.map(
      ([roleId, n], i) =>
        `**${i + 1}.** ${roleLabel(guild, roleId)} — **${n}**`,
    );

    return ctx.reply(
      makeInfoCard(
        `${Emojis.STAR} Top ${top.length} Mentioned Role${top.length === 1 ? "" : "s"}`,
        lines.join("\n"),
        { footer: `Total ${total} mentions across ${counts.size} roles today` },
      ),
    );
  }

  public async reset(ctx: CommandContext) {
    const { guild } = ctx;
    if (!guild) return;

    await ctx.checkPermission(PermissionLevel.ADMIN);

    await resetCounts(guild.id);
    await sendLog(
      guild.id,
      makeInfoCard(
        `${Emojis.CLEANUP} Mention Counters Reset`,
        `Counters were manually reset by ${ctx.user}.`,
      ),
    );

    return ctx.reply(
      makeSuccessCard(
        "Counters Reset",
        "Today's role mention counters have been cleared.",
      ),
    );
  }
}
