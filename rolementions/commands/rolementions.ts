import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import type { Message } from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel, resolvePermissionLevel } from "#lib/permissions.js";
import {
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "#utilities/cards.js";
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
  subcommands: [
    { name: "stats", messageRun: "msgStats", default: true },
    { name: "top", messageRun: "msgTop" },
    { name: "reset", messageRun: "msgReset" },
  ],
})
export class RoleMentionsCommand extends BaseSubcommand {
  public async msgStats(message: Message, args: Args): Promise<unknown> {
    if (!message.inGuild()) return;
    const { guild } = message;
    const role = await args.pick("role").catch(() => null);

    if (role) {
      const count = await getRoleCount(guild.id, role.id);
      return message.reply(
        makeInfoCard(
          `${Emojis.ANALYTICS} Mention Stats`,
          `${roleLabel(guild, role.id)} was mentioned **${count}** time${count === 1 ? "" : "s"} today.`,
        ),
      );
    }

    const counts = await getCounts(guild.id);
    if (counts.size === 0) {
      return message.reply(
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

    return message.reply(
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

  public async msgTop(message: Message, args: Args): Promise<unknown> {
    if (!message.inGuild()) return;
    const { guild } = message;
    const limit = await args
      .pick("integer")
      .then((n) => Math.min(Math.max(n, 1), 25))
      .catch(() => 5);

    const counts = await getCounts(guild.id);
    if (counts.size === 0) {
      return message.reply(
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

    return message.reply(
      makeInfoCard(
        `${Emojis.STAR} Top ${top.length} Mentioned Role${top.length === 1 ? "" : "s"}`,
        lines.join("\n"),
        { footer: `Total ${total} mentions across ${counts.size} roles today` },
      ),
    );
  }

  public async msgReset(message: Message): Promise<unknown> {
    if (!message.inGuild()) return;
    const { guild } = message;

    if ((await resolvePermissionLevel(message)) < PermissionLevel.ADMIN) {
      return message.reply(
        makeErrorCard(
          "Permission Denied",
          "You need at least **Admin** level to reset counters.",
        ),
      );
    }

    await resetCounts(guild.id);
    await sendLog(
      guild.id,
      makeInfoCard(
        `${Emojis.CLEANUP} Mention Counters Reset`,
        `Counters were manually reset by ${message.author}.`,
      ),
    );

    return message.reply(
      makeSuccessCard(
        "Counters Reset",
        "Today's role mention counters have been cleared.",
      ),
    );
  }
}
