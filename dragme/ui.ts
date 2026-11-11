import type { ModuleServices } from "@lumi/module-kit";
import {
  cardMessage,
  type CardReply,
  createActionButton,
  formatTimestamp,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  noPingCard,
  row,
} from "@lumi/ui";
import { ButtonStyle, channelMention, userMention } from "discord.js";
import type { DragRequest } from "./data.js";

const CustomPrefix = "dragme";

function actionRow(request: DragRequest, disabled: boolean) {
  return row(
    createActionButton({
      customId: `${CustomPrefix}:accept:${request.requesterId}:${request.requestId}`,
      label: "Accept",
      style: ButtonStyle.Success,
      disabled,
    }),
    createActionButton({
      customId: `${CustomPrefix}:decline:${request.requesterId}:${request.requestId}`,
      label: "Decline",
      style: ButtonStyle.Danger,
      disabled,
    }),
    createActionButton({
      customId: `${CustomPrefix}:cancel:${request.requesterId}:${request.requestId}`,
      label: "Cancel",
      style: ButtonStyle.Secondary,
      disabled,
    }),
  );
}

export function requestCard(request: DragRequest): CardReply {
  return noPingCard(
    makeInfoCard(
      "Voice Drag Request",
      [
        `${userMention(request.requesterId)} wants to be dragged into ${channelMention(request.channelId)}.`,
        `Requested because ${userMention(request.targetUserId)} is in that channel.`,
        `Anyone currently inside the channel can accept or decline. Expires ${formatTimestamp(new Date(request.expiresAt), "R")}.`,
      ],
      {
        footer: "Only the requester can cancel this request.",
        actionRows: [actionRow(request, false)],
      },
    ),
  );
}

function outcomeCard(
  maker: typeof makeSuccessCard,
  title: string,
  body: string,
  request: DragRequest,
): CardReply {
  return noPingCard(
    maker(title, body, { actionRows: [actionRow(request, true)] }),
  );
}

export function acceptedCard(
  request: DragRequest,
  actorId: string,
): CardReply {
  return outcomeCard(
    makeSuccessCard,
    "Drag Request Accepted",
    `${userMention(actorId)} dragged ${userMention(request.requesterId)} into ${channelMention(request.channelId)}.`,
    request,
  );
}

export function declinedCard(
  request: DragRequest,
  actorId: string,
): CardReply {
  return outcomeCard(
    makeWarningCard,
    "Drag Request Declined",
    `${userMention(actorId)} declined ${userMention(request.requesterId)}'s request to join ${channelMention(request.channelId)}.`,
    request,
  );
}

export function cancelledCard(request: DragRequest): CardReply {
  return outcomeCard(
    makeWarningCard,
    "Drag Request Cancelled",
    `${userMention(request.requesterId)} cancelled their request to join ${channelMention(request.channelId)}.`,
    request,
  );
}

export function expiredCard(request: DragRequest): CardReply {
  return outcomeCard(
    makeWarningCard,
    "Drag Request Expired",
    `${userMention(request.requesterId)}'s request to join ${channelMention(request.channelId)} timed out.`,
    request,
  );
}

export function failedCard(request: DragRequest): CardReply {
  return outcomeCard(
    makeErrorCard,
    "Drag Failed",
    `${userMention(request.requesterId)} could not be moved into ${channelMention(request.channelId)}. They may have left voice or the bot lacks Move Members.`,
    request,
  );
}

export async function editRequestCard(
  services: ModuleServices,
  request: DragRequest,
  card: CardReply,
): Promise<void> {
  const channel = await services.client.channels
    .fetch(request.cardChannelId)
    .catch(() => null);
  if (!channel?.isTextBased()) return;

  const message = await channel.messages
    .fetch(request.cardMessageId)
    .catch(() => null);
  if (!message) return;

  await message.edit(cardMessage(card)).catch(() => undefined);
}
