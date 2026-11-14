import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  createActionButton,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  row,
} from "@lumi/ui";
import {
  ButtonStyle,
  type ButtonInteraction,
  type Message,
  type MessageReplyOptions,
  type ModalSubmitInteraction,
} from "discord.js";
import { readConfig } from "../../config.js";
import {
  authorHashFor,
  getConfession,
  getReply,
  hasReplyDmOptOut,
  isBanned,
  nextReplyPath,
  saveReply,
  type ConfessionRecord,
  type ReplyRecord,
} from "../../data.js";
import {
  buildReplyModal,
  buildReplyToReplyModal,
  MuteDmButtonPrefix,
  quoteText,
  replyCard,
  ReplyImageId,
  ReplyTextId,
} from "../../ui.js";
import {
  attachmentFromUpload,
  readUploadedImage,
  stableCdnUrl,
} from "../../uploads.js";
import {
  deferEphemeral,
  isImageUpload,
  replyEphemeral,
  requireGuild,
  resolveReplyChannel,
  sendModeratorAudit,
} from "../helpers.js";

export async function handleReplyButton(
  interaction: ButtonInteraction,
  services: ModuleServices,
  number: number,
  parentPath: string | null,
): Promise<void> {
  const guildId = await requireGuild(interaction, services);
  if (!guildId) return;

  const record = await getConfession(services, guildId, number);
  if (!record) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Not Found",
        `Confession #${number} no longer exists in this server.`,
      ),
    );
    return;
  }

  if (parentPath) {
    const parent = await getReply(services, guildId, parentPath);
    if (!parent) {
      await replyEphemeral(
        interaction,
        makeErrorCard(
          "Not Found",
          `Reply #${parentPath} no longer exists in this server.`,
        ),
      );
      return;
    }
  }

  const authorHash = await authorHashFor(services, guildId, interaction.user.id);
  if (await isBanned(services, guildId, authorHash)) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Blocked",
        "You can no longer submit confessions or replies in this server.",
      ),
    );
    return;
  }

  const config = await readConfig(services, guildId);
  await interaction.showModal(
    parentPath
      ? buildReplyToReplyModal(number, parentPath, config.allowImages)
      : buildReplyModal(number, config.allowImages),
  );
}

export async function notifyReplyTarget(
  services: ModuleServices,
  guildId: string,
  options: {
    record: ConfessionRecord;
    parent: ReplyRecord | null;
    replierId: string;
    replyPath: string;
    replyText: string;
    jumpUrl: string;
    isOp: boolean;
  },
): Promise<void> {
  const targetId = options.parent
    ? options.parent.authorId
    : options.record.meta.authorId;
  if (!targetId || targetId === options.replierId) return;
  if (await hasReplyDmOptOut(services, guildId, targetId)) return;

  const user = await services.client.users.fetch(targetId).catch(() => null);
  if (!user) return;

  const quote =
    options.replyText.length > 150
      ? `${options.replyText.slice(0, 150)}…`
      : options.replyText;
  const card = makeInfoCard(
    options.isOp ? "👑 The OP replied to you" : "💬 Someone replied to you",
    [
      `**Confession #${options.record.meta.number}** · Reply #${options.replyPath}`,
      quote,
      `[Jump to reply](${options.jumpUrl})`,
    ],
    {
      actionRows: [
        row(
          createActionButton({
            customId: `${MuteDmButtonPrefix}:${guildId}`,
            label: "Stop these DMs",
            style: ButtonStyle.Secondary,
          }),
        ),
      ],
    },
  );
  await user.send(cardCreateOptions(card)).catch((e) =>
    services.observability?.logger?.warn?.("reply DM failed", {
      guildId,
      targetId,
      error: e,
    }),
  );
}

export async function handleReplySubmit(
  interaction: ModalSubmitInteraction,
  services: ModuleServices,
  number: number,
  parentPath: string | null,
): Promise<void> {
  await deferEphemeral(interaction);

  const guildId = await requireGuild(interaction, services);
  if (!guildId) return;

  const record = await getConfession(services, guildId, number);
  if (!record) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Not Found",
        `Confession #${number} no longer exists in this server.`,
      ),
    );
    return;
  }

  const parent = parentPath
    ? await getReply(services, guildId, parentPath)
    : null;
  if (parentPath && !parent) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Not Found",
        `Reply #${parentPath} no longer exists in this server.`,
      ),
    );
    return;
  }

  const config = await readConfig(services, guildId);
  const text = interaction.fields.getTextInputValue(ReplyTextId).trim();
  if (!text) {
    await replyEphemeral(
      interaction,
      makeErrorCard("Empty Reply", "A reply needs some text."),
    );
    return;
  }

  const upload = config.allowImages
    ? readUploadedImage(interaction, ReplyImageId)
    : null;
  if (!isImageUpload(upload)) {
    await replyEphemeral(
      interaction,
      makeErrorCard("Invalid Image", "The attached file must be an image."),
    );
    return;
  }

  const authorHash = await authorHashFor(services, guildId, interaction.user.id);
  if (await isBanned(services, guildId, authorHash)) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Blocked",
        "You can no longer submit confessions or replies in this server.",
      ),
    );
    return;
  }

  const target = await resolveReplyChannel(services, record);
  if (!target) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Unavailable",
        "The confession channel or its thread is no longer available.",
      ),
    );
    return;
  }

  const attachment = upload ? await attachmentFromUpload(upload) : null;
  if (upload && !attachment) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Could Not Process Image",
        "The image could not be read. Please try again with a smaller image.",
      ),
    );
    return;
  }
  const cardImageUrl = attachment ? `attachment://${attachment.name}` : null;

  const path = await nextReplyPath(services, guildId, number, parentPath);
  const isOp = authorHash === record.meta.authorHash;
  const quote = parent ? quoteText(parent.text) : null;
  const card = replyCard(
    number,
    path,
    text,
    cardImageUrl,
    config.reportChannelId !== null,
    isOp,
    quote,
  );
  const basePayload = {
    ...cardCreateOptions(card),
    ...(attachment ? { files: [attachment] } : {}),
  };
  const payload: MessageReplyOptions = parent
    ? {
        ...basePayload,
        reply: { messageReference: parent.messageId, failIfNotExists: false },
      }
    : basePayload;

  let sent: Message;
  try {
    sent = await target.send(payload);
  } catch (error) {
    services.observability?.logger?.warn?.("confession reply failed", {
      guildId,
      error,
    });
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Could Not Reply",
        "I could not post the reply. Please try again later.",
      ),
    );
    return;
  }

  const imageUrl = attachment
    ? stableCdnUrl(sent.attachments.first()?.url ?? "") || null
    : null;

  try {
    await saveReply(services, guildId, {
      path,
      number,
      parentPath,
      authorHash,
      authorId: interaction.user.id,
      text,
      imageUrl,
      isOp,
      messageId: sent.id,
      channelId: target.id,
      createdAt: Date.now(),
    });
  } catch (error) {
    services.observability?.logger?.warn?.("confession reply save failed", {
      guildId,
      error,
    });
    await sent.delete().catch(() => undefined);
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Could Not Reply",
        "The reply could not be recorded, so it was removed. Please try again.",
      ),
    );
    return;
  }

  await replyEphemeral(
    interaction,
    makeSuccessCard(
      "Reply Posted",
      `Your anonymous reply is live as **Reply #${path}**.`,
    ),
  );

  await sendModeratorAudit(
    services,
    config.logChannelId,
    `💬 Moderator Audit — Reply #${path}`,
    [
      `**Author Hash:** \`${authorHash}\``,
      `**Confession:** Confession #${number}`,
      `**Content:** ${text}`,
    ],
    imageUrl,
  );

  if (config.replyDm) {
    await notifyReplyTarget(services, guildId, {
      record,
      parent,
      replierId: interaction.user.id,
      replyPath: path,
      replyText: text,
      jumpUrl: sent.url,
      isOp,
    });
  }
}
