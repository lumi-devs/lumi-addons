import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember } from "discord.js";
import { GuildMessageListener } from "#core/module-system/GuildMessageListener.js";
import { ModuleListener } from "#core/module-system/ModuleListener.js";
import type { GuildMessage } from "#lib/types.js";
import { makeWarningCard } from "#utilities/cards.js";
import { MODULE_NAME } from "../keys.js";
import { getDragmeConfig } from "../lib/config.js";
import { createDragRequest } from "../lib/create-request.js";

const HINT_DELETE_MS = 10_000;
const USER_REF = /<@!?(\d{17,20})>|^(\d{17,20})$/;

/**
 * Message-driven flow in the configured request channel: post a user mention
 * or ID and be dragged to wherever that user currently is. The trigger message
 * is always deleted; invalid input gets a short-lived hint card.
 */
@ApplyOptions<ModuleListener.Options>({ module: MODULE_NAME })
export class DragmeRequestMessageListener extends GuildMessageListener {
  protected async handle(message: GuildMessage): Promise<void> {
    const cfg = await getDragmeConfig(message.guild.id);
    if (!cfg.requestChannelId || message.channelId !== cfg.requestChannelId)
      return;

    const hint = async (body: string) => {
      const card = makeWarningCard("Drag Request", body);
      const reply = await message.channel.send(card).catch(() => null);
      if (reply)
        setTimeout(() => void reply.delete().catch(() => null), HINT_DELETE_MS);
    };

    try {
      const match = USER_REF.exec(message.content.trim());
      if (!match) {
        await hint(
          "Post a **user mention** or **user ID** and I'll ask their voice channel to drag you in — or use `/dragme`.",
        );
        return;
      }
      const targetUserId = match[1] ?? match[2]!;
      const targetMember: GuildMember | null = await message.guild.members
        .fetch(targetUserId)
        .catch(() => null);
      const targetChannel = targetMember?.voice.channel ?? null;
      if (!targetChannel) {
        await hint("That user isn't in a voice channel right now.");
        return;
      }

      const requester =
        message.member ??
        (await message.guild.members
          .fetch(message.author.id)
          .catch(() => null));
      if (!requester) return;

      const result = await createDragRequest(requester, targetChannel);
      if (!result.ok) await hint(result.reason);
    } finally {
      await message.delete().catch(() => null);
    }
  }
}
