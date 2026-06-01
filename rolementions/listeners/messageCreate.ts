import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Message } from "discord.js";
import { checkModulesEnabled } from "#lib/module-check.js";
import { makeInfoCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { MODULE_NAME } from "../lib/keys.js";
import {
  getBlocks,
  getProtectedRoles,
  incrementMentions,
} from "../lib/store.js";
import { applyBlock } from "../lib/protection.js";
import { sendLog } from "../lib/log.js";
import { roleLabel } from "../lib/format.js";

@ApplyOptions<Listener.Options>({
  name: "rolementionsMessageCreate",
  event: Events.MessageCreate,
})
export class RoleMentionsMessageListener extends Listener<
  typeof Events.MessageCreate
> {
  public async run(message: Message): Promise<void> {
    if (!message.inGuild() || message.author.bot) return;
    if (message.mentions.roles.size === 0) return;

    const states = await checkModulesEnabled(message.guildId, [MODULE_NAME]);
    if (!states.get(MODULE_NAME)) return;

    const { guild } = message;
    const roleIds = [...message.mentions.roles.keys()];

    // Counters (one pipelined round-trip, returns today's counts) and the
    // auto-protect flag are independent — fetch them together.
    const [counts, autoProtect] = await Promise.all([
      incrementMentions(guild.id, roleIds),
      this.#autoProtectEnabled(guild.id),
    ]);

    if (autoProtect) {
      // Two whole-guild reads replace the per-role getProtectedDuration + getBlock
      // loop; the rest is in-memory.
      const [protectedRoles, blocks] = await Promise.all([
        getProtectedRoles(guild.id),
        getBlocks(guild.id),
      ]);
      for (const roleId of roleIds) {
        const duration = protectedRoles.get(roleId);
        if (duration === undefined) continue; // not a protected role
        if (blocks.has(roleId)) continue; // already blocked
        const role = message.mentions.roles.get(roleId);
        if (role) await applyBlock(guild, role, duration, false);
      }
    }

    await this.#logMentions(message, roleIds, counts);
  }

  async #autoProtectEnabled(guildId: string): Promise<boolean> {
    const value = await this.container.db.config.getModuleConfig(
      guildId,
      MODULE_NAME,
      "auto_protect",
    );
    return value !== false; // default on
  }

  async #logMentions(
    message: Message<true>,
    roleIds: string[],
    counts: Map<string, number>,
  ): Promise<void> {
    const { guild } = message;

    const lines = roleIds.map(
      (roleId) =>
        `${Emojis.BULLET} ${roleLabel(guild, roleId)} — **${counts.get(roleId) ?? 0}** today`,
    );

    await sendLog(
      guild.id,
      makeInfoCard(
        `${Emojis.BELL} Role Mention${roleIds.length === 1 ? "" : "s"} Detected`,
        [
          `By ${message.author} in ${message.channel} — [jump](${message.url})`,
          lines.join("\n"),
        ],
        { footer: "Counters reset daily at 00:00 UTC." },
      ),
    );
  }
}
