import {
  ActionRowBuilder,
  ButtonBuilder,
  type ContainerBuilder,
} from "@discordjs/builders";
import { ButtonStyle, MessageFlags } from "discord.js";
import {
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "#src/lib/ui/Cards.js";
import type { DragRequestRecord } from "./Keys.js";

export const userMention = (id: string): string => `<@${id}>`;
export const channelMention = (id: string): string => `<#${id}>`;
export const relativeTime = (ms: number): string =>
  `<t:${Math.floor(ms / 1000)}:R>`;

function buttonRow(
  requestId: string,
  disabled: boolean,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`dragme:accept:${requestId}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`dragme:deny:${requestId}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

function withButtons(
  card: CardReply,
  requestId: string,
  disabled: boolean,
): CardReply {
  const container = card.components[0] as ContainerBuilder;
  container.addActionRowComponents((row) => {
    row.addComponents(...buttonRow(requestId, disabled).components);
    return row;
  });
  return {
    flags: (card.flags ?? MessageFlags.IsComponentsV2) & ~MessageFlags.Ephemeral,
    components: card.components,
    allowedMentions: { parse: [] },
  };
}

export function requestCardText(req: DragRequestRecord): string {
  return (
    `${userMention(req.requesterId)} wants to be dragged into ${channelMention(req.channelId)}.\n\n` +
    `Anyone **inside that channel** can accept or decline. Expires ${relativeTime(req.expiresAt)}.`
  );
}

export function requestPayload(req: DragRequestRecord): CardReply & { content: string } {
  const card = withButtons(
    makeInfoCard("Voice Drag Request", requestCardText(req)),
    req.requestId,
    false,
  );
  return { ...card, content: `${userMention(req.requesterId)}, your request is live!` };
}

export function disabledPayload(
  req: DragRequestRecord,
  title: string,
  body: string,
  kind: "success" | "warning" | "error",
): CardReply {
  const base =
    kind === "success"
      ? makeSuccessCard(title, body)
      : kind === "warning"
        ? makeWarningCard(title, body)
        : makeErrorCard(title, body);
  return withButtons(base, req.requestId, true);
}
