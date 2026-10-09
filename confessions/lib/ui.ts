import {
  actionRow,
  makeCard,
  makeInfoCard,
  modal,
  noPingCard,
  type CardReply,
} from "lumi/ui";

export function confessionPayload(
  number: number,
  text: string,
  imageUrl?: string | null,
  title?: string | null,
): CardReply {
  const displayTitle = title?.trim() ? title.trim() : `Confession #${number}`;
  return noPingCard(
    makeInfoCard(`🕊️ ${displayTitle}`, text, {
      footer: `Confession #${number} · anyone can reply anonymously`,
      headerImages: imageUrl ? [imageUrl] : undefined,
      actionRows: [
        actionRow([
          { customId: "confessions:btn:new", label: "Confess", style: "primary", emoji: "🕊️" },
          { customId: `confessions:btn:reply:${number}`, label: "Reply", style: "secondary", emoji: "💬" },
          { customId: `confessions:btn:report:${number}`, label: "Report", style: "danger", emoji: "🚨" },
        ]),
      ],
    }),
  );
}

export function replyPayload(
  confessionNumber: number,
  k: number,
  text: string,
  imageUrl?: string | null,
  isOp = false,
  parentQuote?: string | null,
): CardReply {
  const body = parentQuote ? `${parentQuote}\n\n${text}` : text;
  return noPingCard(
    makeCard(
      isOp ? 0xeab308 : 0x5865f2,
      `💬 Reply #${confessionNumber}.${k}`,
      body,
      {
        footer: isOp ? "👑 OP · Anonymous reply" : "Anonymous reply",
        headerImages: imageUrl ? [imageUrl] : undefined,
        actionRows: [
          actionRow([
            {
              customId: `confessions:btn:replyto:${confessionNumber}:${k}`,
              label: "Reply",
              style: "secondary",
              emoji: "💬",
            },
            {
              customId: `confessions:btn:reportreply:${confessionNumber}:${k}`,
              label: "Report",
              style: "danger",
              emoji: "🚨",
            },
          ]),
        ],
      },
    ),
  );
}

export function buildConfessionModal(allowAttachments: boolean): {
  toJSON(): unknown;
} {
  return modal({
    title: "Anonymous Confession",
    customId: "confessions:modal:new",
    fields: [
      { customId: "title", label: "Title (optional)", required: false, maxLength: 100, placeholder: "Give your confession a title…" },
      { customId: "confession", label: "Your confession", style: "paragraph", maxLength: 2000, placeholder: "This is posted anonymously." },
      ...(allowAttachments
        ? [{ customId: "image_url", label: "Image URL (optional)", required: false, maxLength: 500, placeholder: "https://…" }]
        : []),
    ],
  });
}

export function buildReplyModal(
  confessionNumber: number,
  allowAttachments: boolean,
): { toJSON(): unknown } {
  return modal({
    title: `Reply to Confession #${confessionNumber}`.slice(0, 45),
    customId: `confessions:modal:reply:${confessionNumber}`,
    fields: [
      { customId: "reply", label: "Your reply", style: "paragraph", maxLength: 2000, placeholder: "This is posted anonymously." },
      ...(allowAttachments
        ? [{ customId: "image_url", label: "Image URL (optional)", required: false, maxLength: 500, placeholder: "https://…" }]
        : []),
    ],
  });
}

export function buildReplyToReplyModal(
  confessionNumber: number,
  parentK: number,
  allowAttachments: boolean,
): { toJSON(): unknown } {
  return modal({
    title: `Reply to #${confessionNumber}.${parentK}`.slice(0, 45),
    customId: `confessions:modal:replyto:${confessionNumber}:${parentK}`,
    fields: [
      { customId: "reply", label: "Your reply", style: "paragraph", maxLength: 2000, placeholder: "This is posted anonymously." },
      ...(allowAttachments
        ? [{ customId: "image_url", label: "Image URL (optional)", required: false, maxLength: 500, placeholder: "https://…" }]
        : []),
    ],
  });
}

export function openFormRow() {
  return actionRow([{ customId: "confessions:btn:new", label: "Write Anonymously", style: "primary", emoji: "🕊️" }]);
}
