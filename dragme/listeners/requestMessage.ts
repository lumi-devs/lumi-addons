import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember } from "discord.js";
import { GuildMessageListener, ModuleListener } from "lumi";
import type { GuildMessage } from "lumi/utils";
import { makeWarningCard } from "lumi/ui";
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
    if (message.author.bot) return;

    const cfg = await getDragmeConfig(message.guild.id);
    const isRequestChannel =
      cfg.requestChannelId && message.channelId === cfg.requestChannelId;

    const match = USER_REF.exec(message.content.trim());
    if (!match) {
      if (isRequestChannel) {
        await message.delete().catch(() => null);
        const card = makeWarningCard(
          "Drag Request",
          "Post a **user mention** or **user ID** and I'll ask their voice channel to drag you in — or use `/dragme`.",
        );
        const reply = await message.channel.send(card).catch(() => null);
        if (reply) {
          setTimeout(
            () => void reply.delete().catch(() => null),
            HINT_DELETE_MS,
          );
        }
      }
      return;
    }

    // Only the configured request channel triggers the drag flow — everywhere
    // else, a message that happens to match the pattern is just a normal
    // mention and must be left alone (already returned above if it didn't
    // match at all).
    if (!isRequestChannel) return;

    const targetUserId = match[1] ?? match[2]!;
    const targetMember: GuildMember | null = await message.guild.members
      .fetch(targetUserId)
      .catch(() => null);
    const targetChannel = targetMember?.voice.channel ?? null;

    // Target not in voice — show an error and delete the trigger message
    // (we're inside the request channel past the guard above).
    if (!targetChannel) {
      await message.delete().catch(() => null);
      const card = makeWarningCard(
        "Drag Request",
        "That user isn't in a voice channel right now.",
      );
      const reply = await message.channel.send(card).catch(() => null);
      if (reply) {
        setTimeout(() => void reply.delete().catch(() => null), HINT_DELETE_MS);
      }
      return;
    }

    const requester =
      message.member ??
      (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!requester) return;

    // Hijack message
    await message.delete().catch(() => null);

    const result = await createDragRequest(requester, targetMember!);
    if (!result.ok) {
      const card = makeWarningCard("Drag Request", result.reason);
      const reply = await message.channel.send(card).catch(() => null);
      if (reply) {
        setTimeout(() => void reply.delete().catch(() => null), HINT_DELETE_MS);
      }
    }
  }
}
