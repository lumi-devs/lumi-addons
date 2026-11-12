import {
  createActionButton,
  createPaginationRow,
  formatPageFooter,
  formatTimestamp,
  makeInfoCard,
  noPingCard,
  row,
  type CardOptions,
  type CardReply,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  FileUploadBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalActionRowComponentBuilder,
} from "discord.js";
import { ModuleName } from "./config.js";
import type { ConfessionListItem } from "./data.js";

export const ConfessModalId = `${ModuleName}:confess`;
export const ReplyButtonPrefix = `${ModuleName}:reply`;
export const ReplyModalPrefix = `${ModuleName}:replysubmit`;
export const ListButtonPrefix = `${ModuleName}:list`;
export const ReportButtonPrefix = `${ModuleName}:report`;
export const ConfessTextId = `${ModuleName}:confession-text`;
export const ConfessImageId = `${ModuleName}:confession-image`;
export const ReplyTextId = `${ModuleName}:reply-text`;
export const ReplyImageId = `${ModuleName}:reply-image`;
export const MaxTextLength = 2000;
export const ListPageSize = 10;

function imageGallery(imageUrl: string): MediaGalleryBuilder {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(imageUrl),
  );
}

function imageUploadLabel(customId: string): LabelBuilder {
  return new LabelBuilder()
    .setLabel("Attach an image (optional)")
    .setFileUploadComponent(
      new FileUploadBuilder().setCustomId(customId).setRequired(false),
    );
}

function replyButton(number: number) {
  return createActionButton({
    customId: `${ReplyButtonPrefix}:${number}`,
    label: "Reply anonymously",
    style: ButtonStyle.Secondary,
    emoji: "💬",
  });
}

function reportButton(number: number) {
  return createActionButton({
    customId: `${ReportButtonPrefix}:${number}`,
    label: "Report",
    style: ButtonStyle.Danger,
    emoji: "🚩",
  });
}

export function confessionCard(
  number: number,
  text: string,
  imageUrl: string | null,
  reportable: boolean,
): CardReply {
  const buttons = reportable ? [replyButton(number), reportButton(number)] : [replyButton(number)];
  const options: CardOptions = {
    footer: "Sent anonymously",
    actionRows: [row(...buttons)],
    ...(imageUrl ? { mediaGallery: imageGallery(imageUrl) } : {}),
  };
  return noPingCard(makeInfoCard(`🕊️ Confession #${number}`, text, options));
}

export function replyCard(
  number: number,
  replyNumber: number,
  text: string,
  imageUrl: string | null,
  reportable: boolean,
): CardReply {
  const buttons = reportable ? [replyButton(number), reportButton(number)] : [replyButton(number)];
  const options: CardOptions = {
    footer: `Anonymous reply to Confession #${number}`,
    actionRows: [row(...buttons)],
    ...(imageUrl ? { mediaGallery: imageGallery(imageUrl) } : {}),
  };
  return noPingCard(
    makeInfoCard(`💬 Confession #${number}.${replyNumber}`, text, options),
  );
}

export function buildConfessModal(allowImages: boolean): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(ConfessModalId)
    .setTitle("Anonymous Confession");

  const text = new TextInputBuilder()
    .setCustomId(ConfessTextId)
    .setLabel("Confession")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(MaxTextLength);
  modal.addComponents(
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(text),
  );

  if (allowImages) {
    modal.addComponents(imageUploadLabel(ConfessImageId));
  }

  return modal;
}

export function buildReplyModal(
  number: number,
  allowImages: boolean,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${ReplyModalPrefix}:${number}`)
    .setTitle(`Reply to Confession #${number}`);

  const text = new TextInputBuilder()
    .setCustomId(ReplyTextId)
    .setLabel("Anonymous reply")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(MaxTextLength);
  modal.addComponents(
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(text),
  );

  if (allowImages) {
    modal.addComponents(imageUploadLabel(ReplyImageId));
  }

  return modal;
}

function messageTimestamp(messageId: string): number | null {
  try {
    const value = Number((BigInt(messageId) >> 22n) + 1420070400000n);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function buildConfessionList(
  guildId: string,
  items: ConfessionListItem[],
  page: number,
  userId: string,
): CardReply {
  const totalPages = Math.max(1, Math.ceil(items.length / ListPageSize));
  const currentPage = Math.min(Math.max(0, Math.trunc(page)), totalPages - 1);
  const start = currentPage * ListPageSize;
  const visible = items.slice(start, start + ListPageSize);

  const lines = visible.map(({ number, index }) => {
    const timestamp = messageTimestamp(index.messageId);
    const when =
      timestamp === null
        ? "unknown time"
        : formatTimestamp(new Date(timestamp), "R");
    const url = `https://discord.com/channels/${guildId}/${index.channelId}/${index.messageId}`;
    return `**#${number}** · ${when} · [Jump to message](${url})`;
  });
  if (lines.length === 0) lines.push("No confessions have been posted yet.");

  const actionRows =
    totalPages > 1
      ? [
          createPaginationRow({
            customIdPrefix: `${ListButtonPrefix}:${userId}`,
            currentPage,
            totalPages,
          }),
        ]
      : [];

  return makeInfoCard("Recent Confessions", lines, {
    footer: formatPageFooter(currentPage, totalPages, items.length),
    actionRows,
    separatorAboveActionRows: actionRows.length > 0,
  });
}
