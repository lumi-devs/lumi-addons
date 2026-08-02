import { container } from "@sapphire/framework";
import { channelMention, userMention } from "@discordjs/formatters";
import { makeWarningCard, noPingCard } from "#utilities/cards.js";
import type { DragmeExpirePayload } from "../scheduled-tasks/dragmeExpire.js";
import { buildRequestButtons } from "./create-request.js";
import { deleteRequest, getRequest } from "./requests.js";

export async function handleDragmeExpireFire(
  payload: DragmeExpirePayload,
): Promise<void> {
  const { guildId, userId } = payload;
  const req = await getRequest(guildId, userId);
  if (!req) return; // Already accepted/declined/cleared.

  await deleteRequest(guildId, userId);

  const guild =
    container.client.guilds.cache.get(guildId) ??
    (await container.client.guilds.fetch(guildId).catch(() => null));
  const channel = guild
    ? (guild.channels.cache.get(req.cardChannelId) ??
      (await guild.channels.fetch(req.cardChannelId).catch(() => null)))
    : null;
  if (!channel || !channel.isTextBased()) return;

  const card = noPingCard(
    makeWarningCard(
      "Drag Request Expired",
      `${userMention(userId)}'s request to join ${channelMention(req.targetChannelId)} timed out with no response.`,
      { actionRows: buildRequestButtons(guildId, userId, true) },
    ),
  );
  await channel.messages.edit(req.cardMessageId, { ...card }).catch(() => null);
}
