import {
  actionRow,
  makeCard,
  modal,
  noPingCard,
  type CardReply,
} from "lumi/ui";

export function confessionPayload(
  number: number,
  text: string,
  imageUrl?: string | null,
  title?: string | null,
  showConfessButton = false,
): CardReply {
  const displayTitle = title?.trim() ? title.trim() : `Confession #${number}`;
  const buttons = [];
  if (showConfessButton) {
    buttons.push({ customId: "confessions:btn:new", label: "Make a Confession", style: "primary" } as const);
  }
  buttons.push(
    { customId: `confessions:btn:reply:${number}`, label: "Reply", style: "secondary" } as const,
    { customId: `confessions:btn:report:${number}`, label: "Report", style: "danger" } as const,
  );

  return noPingCard(
    makeCard(0x131313, `💌 ${displayTitle}`, text, {
      footer: `Confession #${number}`,
      headerImages: imageUrl ? [imageUrl] : undefined,
      actionRows: [actionRow(buttons)],
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

  return noPingCard(
    makeCard(
      isOp ? 0xeab308 : 0xab766f,
      `↩️ Reply to Confession #${confessionNumber}`,
      body,
      {
        footer: isOp ? "👑 OP" : undefined,
        headerImages: imageUrl ? [imageUrl] : undefined,
        separatorAboveActionRows: !isOp,
        actionRows: [
          actionRow([
            {
              customId: `confessions:btn:replyto:${confessionNumber}:${k}`,
              label: "Reply",
              style: "secondary",
            },
            {
              customId: `confessions:btn:reportreply:${confessionNumber}:${k}`,
              label: "Report",
              style: "danger",
            },
          ]),
        ],
      },
    ),
  );
}

const uploadField = { kind: "upload", customId: "image", label: "Attach an image (optional)", required: false } as const;

export function buildConfessionModal(allowAttachments: boolean): {
  toJSON(): unknown;
} {
  return modal({
    title: "Anonymous Confession",
    customId: "confessions:modal:new",
    fields: [
      { customId: "title", label: "Title (optional)", required: false, maxLength: 100, placeholder: "Give your confession a title…" },
      { customId: "confession", label: "Your confession", style: "paragraph", maxLength: 2000, placeholder: "This is posted anonymously." },
      ...(allowAttachments ? [uploadField] : []),
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
      ...(allowAttachments ? [uploadField] : []),
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
      ...(allowAttachments ? [uploadField] : []),
    ],
  });
}

export function openFormRow() {
  return actionRow([{ customId: "confessions:btn:new", label: "Write Anonymously", style: "primary" }]);
}
