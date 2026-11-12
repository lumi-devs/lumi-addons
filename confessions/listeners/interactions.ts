import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  cardMessage,
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "@lumi/ui";
import {
  MessageFlags,
  type ButtonInteraction,
  type Interaction,
  type Message,
  type ModalSubmitInteraction,
  type SendableChannels,
} from "discord.js";
import { ModuleName, readConfig } from "../config.js";
import {
  authorHashFor,
  claimCooldown,
  clearCooldown,
  deleteConfessionRecords,
  getConfession,
  isBanned,
  listRecentConfessions,
  nextConfessionNumber,
  nextReplyNumber,
  saveConfession,
  type ConfessionRecord,
} from "../data.js";
import {
  buildConfessionList,
  buildReplyModal,
  confessionCard,
  ConfessImageId,
  ConfessTextId,
  replyCard,
  ReplyImageId,
  ReplyTextId,
} from "../ui.js";
import { readUploadedImage, rehostUpload } from "../rehost.js";

async function replyEphemeral(
  interaction: Interaction,
  card: CardReply,
): Promise<void> {
  const payload = ephemeralCard(card);
  if (!interaction.isRepliable()) return;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(cardMessage(payload)).catch(() => undefined);
  } else {
    await interaction.reply(payload).catch(() => undefined);
  }
}

async function requireGuild(
  interaction: Interaction,
  services: ModuleServices,
): Promise<string | null> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await replyEphemeral(
      interaction,
      makeErrorCard("Server Only", "Confessions can only be used in a server."),
    );
    return null;
  }
  if (!services.modules.isEnabled(guildId, ModuleName)) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Module Disabled",
        "The Confessions module is disabled on this server.",
      ),
    );
    return null;
  }
  return guildId;
}

function isImageUpload(upload: { contentType: string | null } | null): boolean {
  return upload === null || upload.contentType === null || upload.contentType.startsWith("image/");
}

async function resolveReplyChannel(
  services: ModuleServices,
  record: ConfessionRecord,
): Promise<SendableChannels | null> {
  if (record.index.threadId) {
    const thread = await services.client.channels
      .fetch(record.index.threadId)
      .catch(() => null);
    if (thread?.isSendable()) return thread;
  }

  const channel = await services.client.channels
    .fetch(record.index.channelId)
    .catch(() => null);
  if (channel?.isSendable()) return channel;
  return null;
}

async function handleConfessSubmit(
  interaction: ModalSubmitInteraction,
  services: ModuleServices,
): Promise<void> {
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

  const upload = config.allowImages
    ? readUploadedImage(interaction, ConfessImageId)
    : null;
  if (!isImageUpload(upload)) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Invalid Image",
        "The attached file must be an image.",
      ),
    );
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

  let imageUrl: string | null = null;
  if (upload) {
    imageUrl = await rehostUpload(
      services,
      upload,
      config.logChannelId ?? channel.id,
    );
    if (!imageUrl) {
      await clearCooldown(services, guildId, authorHash).catch(() => undefined);
      await replyEphemeral(
        interaction,
        makeErrorCard(
          "Could Not Process Image",
          "The uploaded image could not be saved. Please try again.",
        ),
      );
      return;
    }
  }

  let number: number;
  try {
    number = await nextConfessionNumber(services, guildId);
  } catch (error) {
    services.observability?.logger?.warn?.("confession number allocation failed", {
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

  let message: Message;
  try {
    message = await channel.send(
      cardCreateOptions(confessionCard(number, text, imageUrl)),
    );
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
}

async function handleReplyButton(
  interaction: ButtonInteraction,
  services: ModuleServices,
  number: number,
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
  await interaction.showModal(buildReplyModal(number, config.allowImages));
}

async function handleReplySubmit(
  interaction: ModalSubmitInteraction,
  services: ModuleServices,
  number: number,
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
      makeErrorCard(
        "Invalid Image",
        "The attached file must be an image.",
      ),
    );
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

  let imageUrl: string | null = null;
  if (upload) {
    imageUrl = await rehostUpload(
      services,
      upload,
      config.logChannelId ?? record.index.channelId,
    );
    if (!imageUrl) {
      await replyEphemeral(
        interaction,
        makeErrorCard(
          "Could Not Process Image",
          "The uploaded image could not be saved. Please try again.",
        ),
      );
      return;
    }
  }

  const replyNumber = await nextReplyNumber(
    services,
    guildId,
    record.index.messageId,
  );

  try {
    await target.send(
      cardCreateOptions(
        replyCard(record.meta.number, replyNumber, text, imageUrl),
      ),
    );
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

  await replyEphemeral(
    interaction,
    makeSuccessCard(
      "Reply Posted",
      `Your anonymous reply is live as **Confession #${record.meta.number}.${replyNumber}**.`,
    ),
  );
}

async function handleListButton(
  interaction: ButtonInteraction,
  services: ModuleServices,
  parts: string[],
): Promise<void> {
  const userId = parts[2];
  const action = parts[3];
  if (!userId) return;

  if (interaction.user.id !== userId) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Not Your Panel",
        "This confession list belongs to another moderator.",
      ),
    );
    return;
  }

  if (action !== "prev" && action !== "next") return;

  const guildId = await requireGuild(interaction, services);
  if (!guildId) return;

  const page = Number(parts[4]);
  const items = await listRecentConfessions(services, guildId);
  await interaction
    .update(
      buildConfessionList(
        guildId,
        items,
        Number.isInteger(page) && page >= 0 ? page : 0,
        userId,
      ),
    )
    .catch(() => undefined);
}

export const interactionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith(`${ModuleName}:`)) return;
      const parts = interaction.customId.split(":");
      if (parts[1] === "reply") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        await handleReplyButton(interaction, services, number);
        return;
      }
      if (parts[1] === "list") {
        await handleListButton(interaction, services, parts);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith(`${ModuleName}:`)) return;
      const parts = interaction.customId.split(":");
      if (parts[1] === "confess") {
        await handleConfessSubmit(interaction, services);
        return;
      }
      if (parts[1] === "replysubmit") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        await handleReplySubmit(interaction, services, number);
      }
    }
  },
};
