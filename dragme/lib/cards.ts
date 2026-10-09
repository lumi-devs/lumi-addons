import {
  actionRow,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "lumi/ui";
import type { DragRequestRecord } from "../keys.js";

export const userMention = (id: string): string => `<@${id}>`;
export const channelMention = (id: string): string => `<#${id}>`;
export const relativeTime = (ms: number): string =>
  `<t:${Math.floor(ms / 1000)}:R>`;

function buttonRow(requestId: string, disabled: boolean): unknown {
  return actionRow([
    {
      customId: `dragme:acc:${requestId}`,
      label: "Accept",
      style: "success",
      ...(disabled ? { disabled: true } : {}),
    },
    {
      customId: `dragme:dec:${requestId}`,
      label: "Decline",
      style: "danger",
      ...(disabled ? { disabled: true } : {}),
    },
  ]).toJSON();
}

function channelPayload(card: {
  components: unknown;
}): { components: unknown[]; allowedMentions: { parse: never[] } } {
  return {
    components: [
      ...(JSON.parse(JSON.stringify(card.components)) as unknown[]),
    ],
    allowedMentions: { parse: [] },
  };
}

export function requestCardText(req: DragRequestRecord): string {
  return (
    `${userMention(req.requesterId)} wants to be dragged into ${channelMention(req.channelId)}.\n\n` +
    `Anyone **inside that channel** can accept or decline. Expires ${relativeTime(req.expiresAt)}.`
  );
}

export function requestPayload(req: DragRequestRecord): {
  content: string;
  components: unknown[];
  allowedMentions: { parse: never[] };
} {
  const payload = channelPayload(
    makeInfoCard("Voice Drag Request", requestCardText(req)),
  );
  payload.components.push(buttonRow(req.requestId, false));
  return {
    ...payload,
    content: `${userMention(req.requesterId)}, your request is live!`,
  };
}

export function disabledRequestPayload(
  req: DragRequestRecord,
  title: string,
  body: string,
  kind: "success" | "warning" | "error",
): { components: unknown[]; allowedMentions: { parse: never[] } } {
  const card =
    kind === "success"
      ? makeSuccessCard(title, body)
      : kind === "warning"
        ? makeWarningCard(title, body)
        : makeErrorCard(title, body);
  const payload = channelPayload(card);
  payload.components.push(buttonRow(req.requestId, true));
  return payload;
}
