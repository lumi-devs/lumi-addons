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
export const ReplyToButtonPrefix = `${ModuleName}:replyto`;
export const ReplyModalPrefix = `${ModuleName}:replysubmit`;
export const ReplyToModalPrefix = `${ModuleName}:replytosubmit`;
export const ListButtonPrefix = `${ModuleName}:list`;
export const ReportButtonPrefix = `${ModuleName}:report`;
export const ReportReplyButtonPrefix = `${ModuleName}:reportreply`;
export const MuteDmButtonPrefix = `${ModuleName}:mutedms`;
export const UnmuteDmButtonPrefix = `${ModuleName}:unmutedms`;
export const ConfessTitleId = `${ModuleName}:confession-title`;
export const ConfessTextId = `${ModuleName}:confession-text`;
export const ConfessImageId = `${ModuleName}:confession-image`;
export const ReplyTextId = `${ModuleName}:reply-text`;
export const ReplyImageId = `${ModuleName}:reply-image`;
export const MaxTextLength = 2000;
export const MaxTitleLength = 100;
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

function textInput(
  customId: string,
  label: string,
  style: TextInputStyle,
  options: {
    maxLength: number;
    placeholder: string;
    required?: boolean;
  },
): TextInputBuilder {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setPlaceholder(options.placeholder)
    .setRequired(options.required ?? true)
    .setMaxLength(options.maxLength);
  return input;
}

function replyButton(number: number) {
  return createActionButton({
    customId: `${ReplyButtonPrefix}:${number}`,
    label: "Reply",
    style: ButtonStyle.Secondary,
  });
}

function replyToButton(number: number, path: string) {
  return createActionButton({
    customId: `${ReplyToButtonPrefix}:${number}:${path}`,
    label: "Reply",
    style: ButtonStyle.Secondary,
  });
}

function reportButton(number: number) {
  return createActionButton({
    customId: `${ReportButtonPrefix}:${number}`,
    label: "Report",
    style: ButtonStyle.Danger,
  });
}

function reportReplyButton(number: number, path: string) {
  return createActionButton({
    customId: `${ReportReplyButtonPrefix}:${number}:${path}`,
    label: "Report",
    style: ButtonStyle.Danger,
  });
}

export function quoteText(text: string, limit = 150): string {
  const trimmed = text.length > limit ? `${text.slice(0, limit)}…` : text;
  return trimmed
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export function confessionCard(
  number: number,
  text: string,
  title: string | null,
  imageUrl: string | null,
  reportable: boolean,
): CardReply {
  const buttons = reportable
    ? [replyButton(number), reportButton(number)]
    : [replyButton(number)];
  const displayTitle = title?.trim() ? title.trim() : `Confession #${number}`;
  const options: CardOptions = {
    footer: `Confession #${number}`,
    actionRows: [row(...buttons)],
    ...(imageUrl ? { mediaGallery: imageGallery(imageUrl) } : {}),
  };
  return noPingCard(makeInfoCard(`🕊️ ${displayTitle}`, text, options));
}

export function replyCard(
  number: number,
  path: string,
  text: string,
  imageUrl: string | null,
  reportable: boolean,
  isOp: boolean,
  quote: string | null,
): CardReply {
  const buttons = reportable
    ? [replyToButton(number, path), reportReplyButton(number, path)]
    : [replyToButton(number, path)];
  const body = quote ? [quote, text] : text;
  const options: CardOptions = {
    ...(isOp ? { footer: "👑 OP" } : {}),
    actionRows: [row(...buttons)],
    ...(imageUrl ? { mediaGallery: imageGallery(imageUrl) } : {}),
  };
  const parentPath = path.includes(".")
    ? path.slice(0, path.lastIndexOf("."))
    : null;
  const title = parentPath
    ? `Reply to Reply #${parentPath}`
    : `Reply to Confession #${number}`;
  return noPingCard(makeInfoCard(`↩️ ${title}`, body, options));
}

export function buildConfessModal(allowImages: boolean): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(ConfessModalId)
    .setTitle("Anonymous Confession");

  modal.addComponents(
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      textInput(ConfessTitleId, "Title (optional)", TextInputStyle.Short, {
        maxLength: MaxTitleLength,
        placeholder: "Give your confession a title…",
        required: false,
      }),
    ),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      textInput(ConfessTextId, "Your confession", TextInputStyle.Paragraph, {
        maxLength: MaxTextLength,
        placeholder: "This is posted anonymously.",
      }),
    ),
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

  modal.addComponents(
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      textInput(ReplyTextId, "Your reply", TextInputStyle.Paragraph, {
        maxLength: MaxTextLength,
        placeholder: "This is posted anonymously.",
      }),
    ),
  );

  if (allowImages) {
    modal.addComponents(imageUploadLabel(ReplyImageId));
  }

  return modal;
}

export function buildReplyToReplyModal(
  number: number,
  path: string,
  allowImages: boolean,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${ReplyToModalPrefix}:${number}:${path}`)
    .setTitle(`Reply to Reply #${path}`);

  modal.addComponents(
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      textInput(ReplyTextId, "Your reply", TextInputStyle.Paragraph, {
        maxLength: MaxTextLength,
        placeholder: "This is posted anonymously.",
      }),
    ),
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
