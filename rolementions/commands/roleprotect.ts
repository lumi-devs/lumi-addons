import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import type { Message } from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "#utilities/cards.js";
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
  subcommands: [
    { name: "add", messageRun: "msgAdd" },
    { name: "remove", messageRun: "msgRemove" },
    { name: "list", messageRun: "msgList", default: true },
    { name: "block", messageRun: "msgBlock" },
    { name: "unblock", messageRun: "msgUnblock" },
  ],
})
export class RoleProtectCommand extends BaseSubcommand {
  public async msgAdd(message: Message, args: Args): Promise<unknown> {
    if (!message.inGuild()) return;
    const role = await args.pick("role").catch(() => null);
    if (!role) {
      return message.reply(
        makeErrorCard(
          "Missing Role",
          "Usage: `rp add <role> [duration]` — e.g. `rp add @Staff 2h`.",
        ),
      );
    }

    const duration = await this.#resolveDuration(message.guildId, args);
    if (duration === null) {
      return message.reply(
        makeErrorCard(
          "Invalid Duration",
          "Use a value like `90m`, `2h`, or `1d`.",
        ),
      );
    }

    await setProtectedRole(message.guildId, role.id, duration);
    return message.reply(
      makeSuccessCard(
        "Role Protected",
        `${roleLabel(message.guild, role.id)} will be blocked for **${formatMinutes(duration)}** whenever it is mentioned.`,
      ),
    );
  }

  public async msgRemove(message: Message, args: Args): Promise<unknown> {
    if (!message.inGuild()) return;
    const role = await args.pick("role").catch(() => null);
    if (!role) {
      return message.reply(
        makeErrorCard("Missing Role", "Usage: `rp remove <role>`."),
      );
    }

    const removed = await removeProtectedRole(message.guildId, role.id);
    if (!removed) {
      return message.reply(
        makeErrorCard(
          "Not Protected",
          `${roleLabel(message.guild, role.id)} is not in the protected list.`,
        ),
      );
    }
    return message.reply(
      makeSuccessCard(
        "Protection Removed",
        `${roleLabel(message.guild, role.id)} is no longer auto-protected.`,
      ),
    );
  }

  public async msgList(message: Message): Promise<unknown> {
    if (!message.inGuild()) return;
    const { guild } = message;
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

    return message.reply(
      makeInfoCard(`${Emojis.SHIELD} Role Mention Protection`, [
        `**Protected roles (${protectedRoles.size})**\n${protectedLines.join("\n")}`,
        `**Active blocks (${blocks.size})**\n${blockLines.join("\n")}`,
      ]),
    );
  }

  public async msgBlock(message: Message, args: Args): Promise<unknown> {
    if (!message.inGuild()) return;
    const role = await args.pick("role").catch(() => null);
    if (!role) {
      return message.reply(
        makeErrorCard("Missing Role", "Usage: `rp block <role> [duration]`."),
      );
    }

    if (await getBlock(message.guildId, role.id)) {
      return message.reply(
        makeErrorCard(
          "Already Blocked",
          `${roleLabel(message.guild, role.id)} is already actively blocked.`,
        ),
      );
    }

    const duration = await this.#resolveDuration(message.guildId, args);
    if (duration === null) {
      return message.reply(
        makeErrorCard(
          "Invalid Duration",
          "Use a value like `90m`, `2h`, or `1d`.",
        ),
      );
    }

    const block = await applyBlock(message.guild, role, duration, true);
    return message.reply(
      makeSuccessCard(
        "Role Blocked",
        `Mentions of ${roleLabel(message.guild, role.id)} are blocked until ${relativeTimestamp(block.expiresAt)}.`,
      ),
    );
  }

  public async msgUnblock(message: Message, args: Args): Promise<unknown> {
    if (!message.inGuild()) return;
    const role = await args.pick("role").catch(() => null);
    if (!role) {
      return message.reply(
        makeErrorCard("Missing Role", "Usage: `rp unblock <role>`."),
      );
    }

    const lifted = await liftBlock(message.guild, role.id, "manual");
    if (!lifted) {
      return message.reply(
        makeErrorCard(
          "Not Blocked",
          `${roleLabel(message.guild, role.id)} is not currently blocked.`,
        ),
      );
    }
    return message.reply(
      makeSuccessCard(
        "Block Lifted",
        `Mentions of ${roleLabel(message.guild, role.id)} are allowed again.`,
      ),
    );
  }

  async #resolveDuration(guildId: string, args: Args): Promise<number | null> {
    const raw = await args.pick("string").catch(() => null);
    if (raw) return parseMinutes(raw);
    const configured = await this.container.db.config.getModuleConfig(
      guildId,
      MODULE_NAME,
      "default_duration",
    );
    return typeof configured === "number" && configured > 0
      ? configured
      : DEFAULT_FALLBACK_MINUTES;
  }
}
