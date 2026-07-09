import {
  ActionRowBuilder,
  ButtonBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import { ButtonStyle, TextInputStyle } from "discord.js";
import { makeCard, type CardReply } from "#utilities/cards.js";
import { Colors } from "#utilities/branding.js";

const replyButtonRow = (confessionNumber: number) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confess:reply:${confessionNumber}`)
      .setLabel("Anonymous Reply")
      .setEmoji({ name: "💬" })
      .setStyle(ButtonStyle.Secondary),
  );

const galleryFor = (imageUrl?: string | null) =>
  imageUrl
    ? new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl),
      )
    : undefined;

export function buildConfessionCard(
  number: number,
  text: string,
  imageUrl?: string | null,
): CardReply {
  return makeCard(Colors.PRIMARY, `🕊️ Confession #${number}`, text, {
    footer: "Anonymous · anyone can reply anonymously",
    actionRows: [replyButtonRow(number)],
    mediaGallery: galleryFor(imageUrl),
  });
}

export function buildReplyCard(
  confessionNumber: number,
  k: number,
  text: string,
  imageUrl?: string | null,
): CardReply {
  return makeCard(Colors.PRIMARY, `💬 Reply #${confessionNumber}.${k}`, text, {
    footer: "Anonymous reply",
    actionRows: [replyButtonRow(confessionNumber)],
    mediaGallery: galleryFor(imageUrl),
  });
}

function textArea(
  id: string,
  label: string,
  style: TextInputStyle,
  required: boolean,
  placeholder?: string,
): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(style === TextInputStyle.Paragraph ? 2000 : 400);
  if (placeholder) input.setPlaceholder(placeholder);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

export function buildConfessionModal(allowAttachments: boolean): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("confess:new")
    .setTitle("Anonymous Confession")
    .addComponents(
      textArea(
        "confession",
        "Your confession",
        TextInputStyle.Paragraph,
        true,
        "This is posted anonymously.",
      ),
    );
  if (allowAttachments)
    modal.addComponents(
      textArea(
        "image_url",
        "Image URL (optional)",
        TextInputStyle.Short,
        false,
        "https://…",
      ),
    );
  return modal;
}

export function buildReplyModal(
  confessionNumber: number,
  allowAttachments: boolean,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`confess:replymodal:${confessionNumber}`)
    .setTitle(`Reply to Confession #${confessionNumber}`.slice(0, 45))
    .addComponents(
      textArea(
        "reply",
        "Your reply",
        TextInputStyle.Paragraph,
        true,
        "This is posted anonymously.",
      ),
    );
  if (allowAttachments)
    modal.addComponents(
      textArea(
        "image_url",
        "Image URL (optional)",
        TextInputStyle.Short,
        false,
        "https://…",
      ),
    );
  return modal;
}
