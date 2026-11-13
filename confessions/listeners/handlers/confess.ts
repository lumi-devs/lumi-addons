import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import type { Message, ModalSubmitInteraction } from "discord.js";
import { setConfessButton } from "../../cards.js";
import { readConfig } from "../../config.js";
import {
  authorHashFor,
  claimCooldown,
  clearCooldown,
  deleteConfessionRecords,
  isBanned,
  listRecentConfessions,
  nextConfessionNumber,
  saveConfession,
} from "../../data.js";
import {
  confessionCard,
  ConfessImageId,
  ConfessTextId,
  ConfessTitleId,
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
  sendModeratorAudit,
} from "../helpers.js";

export async function handleConfessSubmit(
  interaction: ModalSubmitInteraction,
  services: ModuleServices,
): Promise<void> {
  await deferEphemeral(interaction);

  const guildId = await requireGuild(interaction, services);
  if (!guildId) return;

  const config = await readConfig(services, guildId);
  if (!config.confessionChannelId) {
    await replyEphemeral(
      interaction,
      makeWarningCard(
        "Not Configured",
        "An administrator needs to choose a confession channel first.",
      ),
    );
    return;
  }

  const channel = await services.client.channels
    .fetch(config.confessionChannelId)
    .catch(() => null);
  if (!channel?.isSendable()) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Channel Unavailable",
        "The confession channel is missing or I cannot send messages there.",
      ),
    );
    return;
  }

  const text = interaction.fields.getTextInputValue(ConfessTextId).trim();
  if (!text) {
    await replyEphemeral(
      interaction,
      makeErrorCard("Empty Confession", "A confession needs some text."),
    );
    return;
  }
  const title =
    interaction.fields.getTextInputValue(ConfessTitleId).trim() || null;

  const upload = config.allowImages
    ? readUploadedImage(interaction, ConfessImageId)
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
        "You can no longer submit confessions in this server.",
      ),
    );
    return;
  }
  if (
    !(await claimCooldown(
      services,
      guildId,
      authorHash,
      config.cooldownMinutes,
    ))
  ) {
    await replyEphemeral(
      interaction,
      makeWarningCard(
        "Slow Down",
        `Please wait before your next confession (cooldown: ${config.cooldownMinutes} minute${config.cooldownMinutes === 1 ? "" : "s"}).`,
      ),
    );
    return;
  }

  const attachment = upload ? await attachmentFromUpload(upload) : null;
  if (upload && !attachment) {
    await clearCooldown(services, guildId, authorHash).catch(() => undefined);
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

  let number: number;
  try {
    number = await nextConfessionNumber(services, guildId);
  } catch (error) {
    services.observability?.logger?.warn?.(
      "confession number allocation failed",
      { guildId, error },
    );
    await clearCooldown(services, guildId, authorHash).catch(() => undefined);
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Could Not Post",
        "I could not post the confession. Please try again later.",
      ),
    );
    return;
  }

  const previous =
    (await listRecentConfessions(services, guildId).catch(() => [])).find(
      (item) => item.number < number,
    ) ?? null;

  let message: Message;
  try {
    message = await channel.send({
      ...cardCreateOptions(
        confessionCard(
          number,
          text,
          title,
          cardImageUrl,
          config.reportChannelId !== null,
          true,
        ),
      ),
      ...(attachment ? { files: [attachment] } : {}),
    });
  } catch (error) {
    services.observability?.logger?.warn?.("confession post failed", {
      guildId,
      error,
    });
    await clearCooldown(services, guildId, authorHash).catch(() => undefined);
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Could Not Post",
        "I could not post the confession. Please try again later.",
      ),
    );
    return;
  }

  const imageUrl = attachment
    ? stableCdnUrl(message.attachments.first()?.url ?? "") || null
    : null;

  let threadId: string | null = null;
  if (config.autoThread) {
    try {
      const thread = await message.startThread({
        name: `Confession #${number}`,
      });
      threadId = thread.id;
    } catch (error) {
      services.observability?.logger?.warn?.(
        "confession thread creation failed",
        { guildId, error },
      );
    }
  }

  const meta = {
    number,
    channelId: channel.id,
    threadId,
    authorHash,
    title,
    text,
    imageUrl,
    authorId: interaction.user.id,
  };
  const index = {
    messageId: message.id,
    channelId: channel.id,
    threadId,
  };

  try {
    await saveConfession(services, guildId, meta, index);
  } catch (error) {
    services.observability?.logger?.warn?.("confession record save failed", {
      guildId,
      error,
    });
    await deleteConfessionRecords(
      services,
      guildId,
      number,
      message.id,
    ).catch(() => undefined);
    if (threadId) {
      const thread = await services.client.channels
        .fetch(threadId)
        .catch(() => null);
      if (thread?.isThread()) {
        await thread.delete().catch(() => undefined);
      }
    }
    await message.delete().catch(() => undefined);
    await clearCooldown(services, guildId, authorHash).catch(() => undefined);
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Could Not Save",
        "The confession could not be recorded, so it was removed. Please try again.",
      ),
    );
    return;
  }

  await replyEphemeral(
    interaction,
    makeSuccessCard(
      "Confession Posted",
      `Your confession is live as **Confession #${number}**.`,
    ),
  );

  await sendModeratorAudit(
    services,
    config.logChannelId,
    `🕊️ Moderator Audit — Confession #${number}`,
    [
      `**Author Hash:** \`${authorHash}\``,
      ...(title ? [`**Title:** ${title}`] : []),
      `**Content:** ${text}`,
    ],
    imageUrl,
  );

  if (previous) {
    await setConfessButton(
      services,
      guildId,
      previous.number,
      false,
      config.reportChannelId !== null,
    );
  }
}
