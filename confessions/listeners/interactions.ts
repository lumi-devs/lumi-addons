import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  cardMessage,
  createActionButton,
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  row,
  type CardReply,
} from "@lumi/ui";
import {
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type Interaction,
  type Message,
  type MessageReplyOptions,
  type ModalSubmitInteraction,
  type SendableChannels,
} from "discord.js";
import { ModuleName, readConfig } from "../config.js";
import { openConfessModal } from "../openConfess.js";
import {
  authorHashFor,
  claimCooldown,
  clearCooldown,
  confessionReportKey,
  deleteConfessionRecords,
  getConfession,
  getReply,
  hasReplyDmOptOut,
  isBanned,
  isReported,
  listRecentConfessions,
  markReported,
  nextConfessionNumber,
  nextReplyPath,
  replyReportKey,
  saveConfession,
  saveReply,
  setReplyDmOptOut,
  type ConfessionRecord,
  type ReplyRecord,
} from "../data.js";
import {
  buildConfessionList,
  buildReplyModal,
  buildReplyToReplyModal,
  MuteDmButtonPrefix,
  UnmuteDmButtonPrefix,
  confessionCard,
  ConfessImageId,
  ConfessTextId,
  ConfessTitleId,
  quoteText,
  replyCard,
  ReplyImageId,
  ReplyTextId,
} from "../ui.js";
import { readUploadedImage } from "../uploads.js";

async function deferEphemeral(interaction: Interaction): Promise<void> {
  if (!interaction.isRepliable() || interaction.deferred || interaction.replied) {
    return;
  }
  await interaction
    .deferReply({ flags: MessageFlags.Ephemeral })
    .catch(() => undefined);
}

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
  return (
    upload === null ||
    upload.contentType === null ||
    upload.contentType.startsWith("image/")
  );
}

function isReplyPath(value: string | undefined): value is string {
  return typeof value === "string" && /^\d+\.\d+(?:\.\d+)*$/.test(value);
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

async function sendModeratorAudit(
  services: ModuleServices,
  logChannelId: string | null,
  title: string,
  lines: string[],
  imageUrl: string | null,
): Promise<void> {
  if (!logChannelId) return;
  const channel = await services.client.channels
    .fetch(logChannelId)
    .catch(() => null);
  if (!channel?.isSendable()) return;
  await channel
    .send(
      cardCreateOptions(
        makeWarningCard(title, lines, {
          ...(imageUrl ? { headerImages: [imageUrl] } : {}),
        }),
      ),
    )
    .catch(() => undefined);
}

async function removeConfessButton(
  services: ModuleServices,
  guildId: string,
  previous: { number: number } | null,
  reportable: boolean,
): Promise<void> {
  if (!previous) return;
  const record = await getConfession(services, guildId, previous.number).catch(
    () => null,
  );
  if (!record?.meta.text) return;
  const channel = await services.client.channels
    .fetch(record.index.channelId)
    .catch(() => null);
  if (!channel || !("messages" in channel)) return;
  await channel.messages
    .fetch(record.index.messageId)
    .then((message) =>
      message.edit(
        cardMessage(
          confessionCard(
            record.meta.number,
            record.meta.text ?? "",
            record.meta.title ?? null,
            record.meta.imageUrl ?? null,
            reportable,
            false,
          ),
        ),
      ),
    )
    .catch(() => undefined);
}

async function handleConfessSubmit(
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

  let imageUrl: string | null = null;
  if (upload) {
    imageUrl = upload.url;
  }

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
    message = await channel.send(
      cardCreateOptions(
        confessionCard(
          number,
          text,
          title,
          imageUrl,
          config.reportChannelId !== null,
          true,
        ),
      ),
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

  await removeConfessButton(
    services,
    guildId,
    previous,
    config.reportChannelId !== null,
  );
}

async function handleReplyButton(
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

async function notifyReplyTarget(
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

  await user.send(cardCreateOptions(card)).catch(() => undefined);
}

async function handleReplySubmit(
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

  let imageUrl: string | null = null;
  if (upload) {
    imageUrl = upload.url;
  }

  const path = await nextReplyPath(services, guildId, number, parentPath);
  const isOp = authorHash === record.meta.authorHash;
  const quote = parent ? quoteText(parent.text) : null;
  const card = replyCard(
    number,
    path,
    text,
    imageUrl,
    config.reportChannelId !== null,
    isOp,
    quote,
  );
  const payload: MessageReplyOptions = parent
    ? {
        ...cardCreateOptions(card),
        reply: { messageReference: parent.messageId, failIfNotExists: false },
      }
    : cardCreateOptions(card);

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

async function submitReport(
  interaction: ButtonInteraction,
  services: ModuleServices,
  options: {
    guildId: string;
    reportChannelId: string;
    pingRoleId: string | null;
    key: string;
    title: string;
    lines: string[];
    alreadyReported: string;
  },
): Promise<void> {
  if (await isReported(services, options.guildId, options.key)) {
    await replyEphemeral(
      interaction,
      makeWarningCard("Already Reported", options.alreadyReported),
    );
    return;
  }

  await deferEphemeral(interaction);

  const channel = await services.client.channels
    .fetch(options.reportChannelId)
    .catch(() => null);
  if (!channel?.isSendable()) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Channel Unavailable",
        "The report channel is missing or I cannot send messages there.",
      ),
    );
    return;
  }

  const lines = options.pingRoleId
    ? [`<@&${options.pingRoleId}>`, ...options.lines]
    : options.lines;

  try {
    await channel.send(cardCreateOptions(makeWarningCard(options.title, lines)));
  } catch (error) {
    services.observability?.logger?.warn?.("confession report failed", {
      guildId: options.guildId,
      error,
    });
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Could Not Report",
        "The report could not be delivered. Please try again later.",
      ),
    );
    return;
  }

  await markReported(services, options.guildId, options.key).catch(
    () => undefined,
  );
  await replyEphemeral(
    interaction,
    makeSuccessCard(
      "Report Submitted",
      "Thank you. Moderators have been notified.",
    ),
  );
}

async function handleReportButton(
  interaction: ButtonInteraction,
  services: ModuleServices,
  number: number,
): Promise<void> {
  const guildId = await requireGuild(interaction, services);
  if (!guildId) return;

  const config = await readConfig(services, guildId);
  if (!config.reportChannelId) {
    await replyEphemeral(
      interaction,
      makeWarningCard(
        "Not Configured",
        "Reporting is not configured in this server.",
      ),
    );
    return;
  }

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

  const jumpUrl = `https://discord.com/channels/${guildId}/${record.index.channelId}/${record.index.messageId}`;
  await submitReport(interaction, services, {
    guildId,
    reportChannelId: config.reportChannelId,
    pingRoleId: config.reportPingRoleId,
    key: confessionReportKey(number),
    title: `🚨 Confession Report #${record.meta.number}`,
    lines: [
      `**Reporter:** <@${interaction.user.id}> (${interaction.user.id})`,
      `**Confession:** #${record.meta.number}`,
      `**Channel:** <#${record.index.channelId}>`,
      `[Jump to message](${jumpUrl})`,
    ],
    alreadyReported:
      "Moderators have already been notified about this confession.",
  });
}

async function handleReportReply(
  interaction: ButtonInteraction,
  services: ModuleServices,
  number: number,
  path: string,
): Promise<void> {
  const guildId = await requireGuild(interaction, services);
  if (!guildId) return;

  const config = await readConfig(services, guildId);
  if (!config.reportChannelId) {
    await replyEphemeral(
      interaction,
      makeWarningCard(
        "Not Configured",
        "Reporting is not configured in this server.",
      ),
    );
    return;
  }

  const reply = await getReply(services, guildId, path);
  if (!reply) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Not Found",
        `Reply #${path} no longer exists in this server.`,
      ),
    );
    return;
  }

  const jumpUrl = `https://discord.com/channels/${guildId}/${reply.channelId}/${reply.messageId}`;
  await submitReport(interaction, services, {
    guildId,
    reportChannelId: config.reportChannelId,
    pingRoleId: config.reportPingRoleId,
    key: replyReportKey(path),
    title: `🚨 Reply Report #${path}`,
    lines: [
      `**Reporter:** <@${interaction.user.id}> (${interaction.user.id})`,
      `**Author Hash:** \`${reply.authorHash}\``,
      `**Confession:** #${number}`,
      `**Reply:** #${path}`,
      `**Content:** ${reply.text}`,
      `[Jump to message](${jumpUrl})`,
    ],
    alreadyReported:
      "Moderators have already been notified about this reply.",
  });
}

async function handleDmOptOut(
  interaction: ButtonInteraction,
  services: ModuleServices,
  guildId: string | undefined,
  optOut: boolean,
): Promise<void> {
  if (!guildId) return;
  await setReplyDmOptOut(services, guildId, interaction.user.id, optOut);

  const card = optOut
    ? makeWarningCard(
        "Reply DMs Off",
        "You won't be DM'd about replies in that server anymore.",
        {
          actionRows: [
            row(
              createActionButton({
                customId: `${UnmuteDmButtonPrefix}:${guildId}`,
                label: "Undo",
                style: ButtonStyle.Secondary,
              }),
            ),
          ],
        },
      )
    : makeSuccessCard(
        "Reply DMs On",
        "You'll be DM'd when someone replies to you again.",
      );

  const payload = interaction.inGuild() ? ephemeralCard(card) : card;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(cardMessage(payload)).catch(() => undefined);
    return;
  }
  await interaction
    .reply({
      ...payload,
      ...(interaction.inGuild()
        ? { flags: (payload.flags ?? 0) | MessageFlags.Ephemeral }
        : {}),
    })
    .catch(() => undefined);
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
      const action = parts[1];

      if (action === "mutedms" || action === "unmutedms") {
        await handleDmOptOut(
          interaction,
          services,
          parts[2],
          action === "mutedms",
        );
        return;
      }

      if (action === "new") {
        await openConfessModal(interaction, services);
        return;
      }

      if (action === "reply" || action === "replyto") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        const parentPath = action === "replyto" && isReplyPath(parts[3])
          ? parts[3]
          : null;
        if (action === "replyto" && !parentPath) return;
        await handleReplyButton(interaction, services, number, parentPath);
        return;
      }

      if (action === "report") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        await handleReportButton(interaction, services, number);
        return;
      }

      if (action === "reportreply") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        if (!isReplyPath(parts[3])) return;
        await handleReportReply(interaction, services, number, parts[3]);
        return;
      }

      if (action === "list") {
        await handleListButton(interaction, services, parts);
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith(`${ModuleName}:`)) return;
      const parts = interaction.customId.split(":");
      const action = parts[1];

      if (action === "confess") {
        await handleConfessSubmit(interaction, services);
        return;
      }

      if (action === "replysubmit") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        await handleReplySubmit(interaction, services, number, null);
        return;
      }

      if (action === "replytosubmit") {
        const number = Number(parts[2]);
        if (!Number.isInteger(number) || number < 1) return;
        if (!isReplyPath(parts[3])) return;
        await handleReplySubmit(interaction, services, number, parts[3]);
      }
    }
  },
};
