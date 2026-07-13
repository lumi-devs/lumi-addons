import {
  ActionRowBuilder,
  ButtonBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextInputBuilder,
  LabelBuilder,
  FileUploadBuilder,
} from "@discordjs/builders";
import { ButtonStyle, TextInputStyle } from "discord.js";
import { makeCard, type CardReply } from "#utilities/cards.js";
import { Colors } from "#utilities/branding.js";

const replyButtonRow = (
  confessionNumber: number,
  showConfessButton: boolean,
) => {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (showConfessButton) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("confess:new_button")
        .setLabel("Make a Confession")
        .setEmoji({ name: "🕊️" })
        .setStyle(ButtonStyle.Primary),
    );
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`confess:reply:${confessionNumber}`)
      .setLabel("Reply")
      .setEmoji({ name: "💬" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`confess:report:${confessionNumber}`)
      .setLabel("Report")
      .setEmoji({ name: "🚨" })
      .setStyle(ButtonStyle.Danger),
  );
  return row;
};

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
  title?: string | null,
  showConfessButton = true,
): CardReply {
  const displayTitle = title?.trim() ? title.trim() : `Confession #${number}`;
  return makeCard(Colors.PRIMARY, `🕊️ ${displayTitle}`, text, {
    footer: `Confession #${number} · anyone can reply anonymously`,
    actionRows: [replyButtonRow(number, showConfessButton)],
    mediaGallery: galleryFor(imageUrl),
  });
}

export function buildReplyCard(
  confessionNumber: number,
  k: number,
  text: string,
  imageUrl?: string | null,
  isOp = false,
  parentQuote?: string | null,
  replyId?: string | number | null,
): CardReply {
  const bodyText = parentQuote ? `${parentQuote}\n\n${text}` : text;
  const footerText = isOp ? "👑 OP · Anonymous reply" : "Anonymous reply";
  const color = isOp ? Colors.WARNING : Colors.PRIMARY; // Gold/warning if OP, primary if not

  const actionRow = new ActionRowBuilder<ButtonBuilder>();
  if (replyId) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`confess:replyto:${confessionNumber}:${replyId}`)
        .setLabel("Reply")
        .setEmoji({ name: "💬" })
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`confess:reportreply:${confessionNumber}:${replyId}`)
        .setLabel("Report")
        .setEmoji({ name: "🚨" })
        .setStyle(ButtonStyle.Danger),
    );
  } else {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`confess:reply:${confessionNumber}`)
        .setLabel("Reply")
        .setEmoji({ name: "💬" })
        .setStyle(ButtonStyle.Secondary),
    );
  }

  return makeCard(color, `💬 Reply #${confessionNumber}.${k}`, bodyText, {
    footer: footerText,
    actionRows: [actionRow],
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

function imageUploadComponent(): LabelBuilder {
  const fileUpload = new FileUploadBuilder()
    .setCustomId("image_upload")
    .setRequired(false)
    .setMinValues(0)
    .setMaxValues(1);

  return new LabelBuilder()
    .setLabel("Attach an image (optional)")
    .setFileUploadComponent(fileUpload);
}

export function buildConfessionModal(allowAttachments: boolean): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("confess:new")
    .setTitle("Anonymous Confession");

  const titleInput = textArea(
    "title",
    "Title (optional)",
    TextInputStyle.Short,
    false,
    "Give your confession a title...",
  );
  titleInput.components[0]?.setMaxLength(100);

  modal.addComponents(
    titleInput,
    textArea(
      "confession",
      "Your confession",
      TextInputStyle.Paragraph,
      true,
      "This is posted anonymously.",
    ),
  );
  if (allowAttachments) {
    modal.addComponents(imageUploadComponent());
  }
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
  if (allowAttachments) {
    modal.addComponents(imageUploadComponent());
  }
  return modal;
}

export function buildReplyToReplyModal(
  confessionNumber: number,
  parentReplyId: string,
  allowAttachments: boolean,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`confess:replytomodal:${confessionNumber}:${parentReplyId}`)
    .setTitle(`Reply to Reply`.slice(0, 45))
    .addComponents(
      textArea(
        "reply",
        "Your reply",
        TextInputStyle.Paragraph,
        true,
        "This is posted anonymously.",
      ),
    );
  if (allowAttachments) {
    modal.addComponents(imageUploadComponent());
  }
  return modal;
}
