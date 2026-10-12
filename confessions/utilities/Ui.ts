import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  makeCard,
  noPingCard,
  type CardReply,
} from "@lumi-devs/lumi/lib/ui/Cards.js";

export function confessionPayload(
  number: number,
  text: string,
  imageUrl?: string | null,
  title?: string | null,
  showConfessButton = false,
): CardReply {
  const displayTitle = title?.trim() ? title.trim() : `Confession #${number}`;
  const buttons: ButtonBuilder[] = [];
  if (showConfessButton) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("confessions:btn:new")
        .setLabel("Make a Confession")
        .setStyle(ButtonStyle.Primary),
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`confessions:btn:reply:${number}`)
      .setLabel("Reply")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`confessions:btn:report:${number}`)
      .setLabel("Report")
      .setStyle(ButtonStyle.Danger),
  );

  return noPingCard(
    makeCard(0x131313, `💌 ${displayTitle}`, text, {
      footer: `Confession #${number}`,
      headerImages: imageUrl ? [imageUrl] : undefined,
      actionRows: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
    }),
  );
}

export function replyPayload(
  confessionNumber: number,
  k: number,
  text: string,
  imageUrl?: string | null,
  isOp = false,
  parentRef?: { label: string; quote: string | null },
): CardReply {
  const body: string[] = [];
  if (parentRef?.quote) {
    body.push(parentRef.quote);
  }
  body.push(text);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confessions:btn:replyto:${confessionNumber}:${k}`)
      .setLabel("Reply")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`confessions:btn:reportreply:${confessionNumber}:${k}`)
      .setLabel("Report")
      .setStyle(ButtonStyle.Danger),
  );

  return noPingCard(
    makeCard(
      isOp ? 0xeab308 : 0xab766f,
      `↩️ Reply to Confession #${confessionNumber}`,
      body,
      {
        footer: isOp ? "👑 OP" : undefined,
        headerImages: imageUrl ? [imageUrl] : undefined,
        separatorAboveActionRows: !isOp,
        actionRows: [row],
      },
    ),
  );
}

export function buildConfessionModal(allowAttachments: boolean): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("confessions:modal:new")
    .setTitle("Anonymous Confession");

  const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId("title")
      .setLabel("Title (optional)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100)
      .setPlaceholder("Give your confession a title..."),
  );

  const confessionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId("confession")
      .setLabel("Your confession")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000)
      .setPlaceholder("This is posted anonymously."),
  );

  modal.addComponents(titleRow, confessionRow);

  if (allowAttachments) {
    const imageRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("image")
        .setLabel("Attach image URL (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder("https://example.com/image.png"),
    );
    modal.addComponents(imageRow);
  }

  return modal;
}

export function buildReplyModal(
  confessionNumber: number,
  allowAttachments: boolean,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`confessions:modal:reply:${confessionNumber}`)
    .setTitle(`Reply to Confession #${confessionNumber}`.slice(0, 45));

  const replyRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId("reply")
      .setLabel("Your reply")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000)
      .setPlaceholder("This is posted anonymously."),
  );

  modal.addComponents(replyRow);

  if (allowAttachments) {
    const imageRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("image")
        .setLabel("Attach image URL (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder("https://example.com/image.png"),
    );
    modal.addComponents(imageRow);
  }

  return modal;
}

export function buildReplyToReplyModal(
  confessionNumber: number,
  parentK: number,
  allowAttachments: boolean,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`confessions:modal:replyto:${confessionNumber}:${parentK}`)
    .setTitle(`Reply to #${confessionNumber}.${parentK}`.slice(0, 45));

  const replyRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    new TextInputBuilder()
      .setCustomId("reply")
      .setLabel("Your reply")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(2000)
      .setPlaceholder("This is posted anonymously."),
  );

  modal.addComponents(replyRow);

  if (allowAttachments) {
    const imageRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("image")
        .setLabel("Attach image URL (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder("https://example.com/image.png"),
    );
    modal.addComponents(imageRow);
  }

  return modal;
}

export function openFormRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("confessions:btn:new")
      .setLabel("Write Anonymously")
      .setStyle(ButtonStyle.Primary),
  );
}
