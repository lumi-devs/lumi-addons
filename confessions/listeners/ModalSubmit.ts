import {
  Events,
  type ModalSubmitInteraction,
  type SendableChannels,
} from "discord.js";
import { defineListener } from "@lumi-devs/lumi/listeners";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi-devs/lumi/ui";
import type { Container } from "@lumi-devs/lumi/services";
import { getConfessionsConfig } from "../utilities/Config.js";
import {
  authorHashFor,
  findConfessionAuthor,
  findReplyAuthor,
  getConfession,
  getReply,
  hasReplyDmOptOut,
  isBanned,
  nextConfessionNumber,
  nextReplyNumber,
  onCooldown,
  recordConfessionAuthor,
  recordReplyAuthor,
  saveConfession,
  saveReply,
  setCooldown,
} from "../utilities/Data.js";
import { confessionPayload, replyPayload } from "../utilities/Ui.js";
import { rehostUpload } from "../utilities/Rehost.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

function getUploadAttachment(interaction: ModalSubmitInteraction, customId: string) {
  try {
    const file = interaction.fields.getUploadedFiles(customId, false)?.first();
    if (file?.url) return { url: file.url, filename: file.name };
  } catch {
  }

  const raw = (interaction as unknown as {
    data?: {
      components?: { component?: { custom_id?: string; values?: string[] } }[];
      resolved?: { attachments?: Record<string, { url: string; filename: string }> };
    };
  }).data;

  const resolved = raw?.resolved?.attachments;
  if (!resolved) return null;

  for (const row of raw?.components ?? []) {
    if (row.component?.custom_id === customId) {
      const id = row.component.values?.[0];
      if (id && resolved[id]) return resolved[id];
    }
  }

  return Object.values(resolved)[0] ?? null;
}

async function handleNew(services: Container, interaction: ModalSubmitInteraction, guildId: string) {
  await interaction.deferReply({ ephemeral: true });

  const config = await getConfessionsConfig(services, guildId);
  if (!config.channelId) {
    return interaction.editReply(
      ephemeralCard(makeWarningCard("Not Configured", "The confession channel is not configured.")),
    );
  }

  const hash = await authorHashFor(services, guildId, interaction.user.id);
  if (await isBanned(services, guildId, hash)) {
    return interaction.editReply(
      ephemeralCard(makeErrorCard("Blocked", "You can no longer submit confessions here.")),
    );
  }

  if (await onCooldown(services, guildId, hash, config.cooldownMinutes)) {
    return interaction.editReply(
      ephemeralCard(
        makeWarningCard(
          "Slow Down",
          `Please wait before your next confession (cooldown: ${config.cooldownMinutes}m).`,
        ),
      ),
    );
  }

  const title = interaction.fields.getTextInputValue("title").trim() || null;
  const text = interaction.fields.getTextInputValue("confession").trim();
  if (!text) {
    return interaction.editReply(
      ephemeralCard(makeErrorCard("Empty", "Your confession was empty.")),
    );
  }

  let imageUrl: string | null = null;
  if (config.allowAttachments) {
    const upload = getUploadAttachment(interaction, "image");
    if (upload) {
      imageUrl = await rehostUpload(
        services,
        upload.url,
        upload.filename,
        config.logChannelId ?? config.channelId,
      );
    }
  }

  const number = await nextConfessionNumber(services, guildId);
  const prevNumber = number > 1 ? number - 1 : null;
  if (prevNumber) {
    const prevMeta = await getConfession(services, guildId, prevNumber);
    if (prevMeta?.messageId) {
      const targetChannel = await services.client.channels.fetch(config.channelId).catch(() => null);
      if (targetChannel && "messages" in targetChannel) {
        const strippedPayload = confessionPayload(
          prevMeta.number,
          prevMeta.text,
          prevMeta.imageUrl,
          prevMeta.title,
          false,
        );
        const prevMsg = await (targetChannel as SendableChannels).messages.fetch(prevMeta.messageId).catch(() => null);
        if (prevMsg) {
          await prevMsg.edit(strippedPayload).catch(() => null);
        }
      }
    }
  }

  const channel = await services.client.channels.fetch(config.channelId).catch(() => null);
  if (!channel || !channel.isSendable()) {
    return interaction.editReply(
      ephemeralCard(makeErrorCard("Unavailable", "Could not send the confession to the configured channel.")),
    );
  }

  const sent = await channel.send(
    confessionPayload(number, text, imageUrl, title, true),
  );

  let threadId: string | null = null;
  if (config.autoThread && "threads" in channel) {
    const thread = await channel.threads
      .create({
        name: `Confession #${number}`,
        startMessage: sent.id,
        autoArchiveDuration: 1440,
      })
      .catch(() => null);
    threadId = thread?.id ?? null;
  }

  if (config.logChannelId) {
    const logChannel = await services.client.channels.fetch(config.logChannelId).catch(() => null);
    if (logChannel && logChannel.isSendable()) {
      const auditLines = [
        `**Author Hash:** \`${hash}\``,
        title ? `**Title:** ${title}` : null,
        `**Content:** ${text}`,
      ]
        .filter(Boolean)
        .join("\n");
      await logChannel.send(
        makeWarningCard(`🕊️ Moderator Audit — Confession #${number}`, auditLines, {
          headerImages: imageUrl ? [imageUrl] : undefined,
        }),
      ).catch(() => null);
    }
  }

  await saveConfession(services, guildId, {
    number,
    messageId: sent.id,
    threadId,
    authorHash: hash,
    createdAt: Date.now(),
    title,
    text,
    imageUrl,
  });

  await recordConfessionAuthor(services, guildId, number, interaction.user.id);
  await setCooldown(services, guildId, hash, config.cooldownMinutes);

  return interaction.editReply(
    ephemeralCard(
      makeSuccessCard("Confession Posted", `Posted anonymously as **Confession #${number}**.`),
    ),
  );
}

async function handleReply(
  services: Container,
  interaction: ModalSubmitInteraction,
  guildId: string,
  number: number,
  parentK: number | null,
) {
  await interaction.deferReply({ ephemeral: true });

  const config = await getConfessionsConfig(services, guildId);
  const meta = await getConfession(services, guildId, number);
  if (!meta) {
    return interaction.editReply(
      ephemeralCard(makeErrorCard("Gone", "That confession no longer exists.")),
    );
  }

  const hash = await authorHashFor(services, guildId, interaction.user.id);
  if (await isBanned(services, guildId, hash)) {
    return interaction.editReply(
      ephemeralCard(makeErrorCard("Blocked", "You can no longer participate in confessions here.")),
    );
  }

  const text = interaction.fields.getTextInputValue("reply").trim();
  if (!text) {
    return interaction.editReply(
      ephemeralCard(makeErrorCard("Empty", "Your reply was empty.")),
    );
  }

  if (!config.channelId) {
    return interaction.editReply(
      ephemeralCard(makeErrorCard("Not Configured", "The confession channel is not configured.")),
    );
  }

  let imageUrl: string | null = null;
  if (config.allowAttachments) {
    const upload = getUploadAttachment(interaction, "image");
    if (upload) {
      imageUrl = await rehostUpload(
        services,
        upload.url,
        upload.filename,
        config.logChannelId ?? config.channelId,
      );
    }
  }

  let parentRef: { label: string; quote: string | null } | undefined;
  let parentMessageId: string | null = null;

  if (parentK !== null) {
    const parent = await getReply(services, guildId, number, parentK);
    if (parent) {
      const truncated = parent.text.length > 150 ? `${parent.text.slice(0, 150)}…` : parent.text;
      parentRef = {
        label: `In reply to Reply #${number}.${parentK}`,
        quote: truncated.split("\n").map((l) => `> ${l}`).join("\n"),
      };
      parentMessageId = parent.messageId;
    }
  } else {
    const truncated = meta.text.length > 150 ? `${meta.text.slice(0, 150)}…` : meta.text;
    parentRef = {
      label: `In reply to Confession #${number}`,
      quote: truncated.split("\n").map((l) => `> ${l}`).join("\n"),
    };
  }

  const isOp = hash === meta.authorHash;
  const k = await nextReplyNumber(services, guildId, number);
  const targetChannelId = meta.threadId ?? config.channelId;
  const channel = await services.client.channels.fetch(targetChannelId).catch(() => null);
  if (!channel || !channel.isSendable()) {
    return interaction.editReply(
      ephemeralCard(makeErrorCard("Unavailable", "Could not post your reply.")),
    );
  }

  const payload = replyPayload(number, k, text, imageUrl, isOp, parentRef);
  const sendOpts: Record<string, unknown> = { ...payload };
  if (parentMessageId) {
    sendOpts["reply"] = { messageReference: parentMessageId, failIfNotExists: false };
    sendOpts["allowedMentions"] = { parse: [], repliedUser: false };
  }

  const sent = await channel.send(sendOpts as never).catch(() => null);
  if (!sent) {
    return interaction.editReply(
      ephemeralCard(makeErrorCard("Unavailable", "Could not post your reply.")),
    );
  }

  if (config.logChannelId) {
    const logChannel = await services.client.channels.fetch(config.logChannelId).catch(() => null);
    if (logChannel && logChannel.isSendable()) {
      const auditLines = [
        `**Author Hash:** \`${hash}\``,
        `**Confession:** Confession #${number}`,
        `**Content:** ${text}`,
      ].join("\n");
      await logChannel.send(
        makeWarningCard(`💬 Moderator Audit — Reply #${number}.${k}`, auditLines, {
          headerImages: imageUrl ? [imageUrl] : undefined,
        }),
      ).catch(() => null);
    }
  }

  await saveReply(services, guildId, number, k, {
    number,
    k,
    authorHash: hash,
    text,
    createdAt: Date.now(),
    messageId: sent.id,
  });

  await recordReplyAuthor(services, guildId, number, k, interaction.user.id);

  if (config.replyDm) {
    notifyTarget(services, guildId, {
      number,
      parentK,
      replierId: interaction.user.id,
      replyText: text,
      jumpUrl: sent.url,
      isOp,
    }).catch(() => null);
  }

  return interaction.editReply(
    ephemeralCard(
      makeSuccessCard("Reply Posted", `Posted anonymously as **Reply #${number}.${k}**.`),
    ),
  );
}

async function notifyTarget(
  services: Container,
  guildId: string,
  opts: {
    number: number;
    parentK: number | null;
    replierId: string;
    replyText: string;
    jumpUrl: string;
    isOp: boolean;
  },
) {
  const targetId =
    opts.parentK !== null
      ? await findReplyAuthor(services, guildId, opts.number, opts.parentK)
      : await findConfessionAuthor(services, guildId, opts.number);

  if (!targetId || targetId === opts.replierId) return;
  if (await hasReplyDmOptOut(services, guildId, targetId)) return;

  const quote =
    opts.replyText.length > 150
      ? `${opts.replyText.slice(0, 150)}…`
      : opts.replyText;

  const targetUser = await services.client.users.fetch(targetId).catch(() => null);
  if (!targetUser) return;

  await targetUser.send({
    ...makeInfoCard(
      opts.isOp ? "👑 The OP replied to you" : "💬 Someone replied to you",
      `**Confession #${opts.number}**\n${quote}\n[Jump to reply](${opts.jumpUrl})`,
      {
        actionRows: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`confessions:btn:mutedms:${guildId}`)
              .setLabel("Stop these DMs")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      },
    ),
  }).catch(() => undefined);
}

export const confessionModalListener = defineListener<[ModalSubmitInteraction]>({
  name: "confessionModalSubmit",
  event: Events.InteractionCreate,
  async execute(services: Container, interaction: ModalSubmitInteraction) {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith("confessions:modal")) return;
    if (!interaction.guildId) return;

    const parts = interaction.customId.split(":");
    const kind = parts[2];
    const number = Number(parts[3]);
    const parentK = parts[4] !== undefined ? Number(parts[4]) : null;

    if (kind === "new") {
      await handleNew(services, interaction, interaction.guildId);
      return;
    }
    if ((kind === "reply" || kind === "replyto") && Number.isInteger(number)) {
      await handleReply(
        services,
        interaction,
        interaction.guildId,
        number,
        Number.isInteger(parentK) ? parentK : null,
      );
      return;
    }
  },
});
