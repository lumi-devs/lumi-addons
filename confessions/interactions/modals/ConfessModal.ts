import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ModalSubmitInteraction,
} from "discord.js";
import { defineInteraction } from "@lumi-devs/lumi/lib/interactions/InteractionDef.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi-devs/lumi/lib/ui/Cards.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { MODULE_NAME } from "../../utilities/Keys.js";
import { getConfessionsConfig } from "../../utilities/Config.js";
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
} from "../../utilities/Data.js";
import { sanitizeAttachmentUrl } from "../../utilities/Anon.js";
import { confessionPayload, replyPayload } from "../../utilities/Ui.js";

async function notifyTarget(
  services: Container,
  guildId: string,
  opts: {
    replyDm: boolean;
    number: number;
    parentK: number | null;
    replierId: string;
    replyText: string;
    jumpUrl: string;
    isOp: boolean;
  },
): Promise<void> {
  if (!opts.replyDm) return;
  const targetId =
    opts.parentK !== null
      ? await findReplyAuthor(services, guildId, opts.number, opts.parentK)
      : await findConfessionAuthor(services, guildId, opts.number);
  if (!targetId || targetId === opts.replierId) return;
  if (await hasReplyDmOptOut(services, guildId, targetId)) return;
  const quote =
    opts.replyText.length > 150
      ? `${opts.replyText.slice(0, 150)}...`
      : opts.replyText;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confessions:btn:mutedms:${guildId}`)
      .setLabel("Stop these DMs")
      .setStyle(ButtonStyle.Secondary),
  );

  const targetUser = await services.client.users.fetch(targetId).catch(() => null);
  if (targetUser) {
    await targetUser.send(
      makeInfoCard(
        opts.isOp ? "👑 The OP replied to you" : "💬 Someone replied to you",
        `**Confession #${opts.number}**\n${quote}\n[Jump to reply](${opts.jumpUrl})`,
        { actionRows: [row] },
      ),
    ).catch(() => undefined);
  }
}

async function handleNew(
  services: Container,
  interaction: ModalSubmitInteraction,
  guildId: string,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const config = await getConfessionsConfig(services, guildId);
  if (!config.channelId) {
    await interaction.editReply(
      ephemeralCard(
        makeWarningCard(
          "Not Configured",
          "The confession channel is not configured.",
        ),
      ),
    );
    return;
  }

  const hash = await authorHashFor(services, guildId, interaction.user.id);
  if (await isBanned(services, guildId, hash)) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard("Blocked", "You can no longer submit confessions here."),
      ),
    );
    return;
  }
  if (await onCooldown(services, guildId, hash, config.cooldownMinutes)) {
    await interaction.editReply(
      ephemeralCard(
        makeWarningCard(
          "Slow Down",
          `Please wait before your next confession (cooldown: ${config.cooldownMinutes}m).`,
        ),
      ),
    );
    return;
  }

  let title: string | null;
  try {
    const rawTitle = interaction.fields.getTextInputValue("title");
    title = rawTitle.trim() || null;
  } catch {
    title = null;
  }

  const text = interaction.fields.getTextInputValue("confession").trim();
  if (!text) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Empty", "Your confession was empty.")),
    );
    return;
  }

  let imageUrl: string | null = null;
  if (config.allowAttachments) {
    try {
      const rawImage = interaction.fields.getTextInputValue("image");
      imageUrl = sanitizeAttachmentUrl(rawImage);
    } catch {
      imageUrl = null;
    }
  }

  const confessionChannel = await services.client.channels.fetch(config.channelId).catch(() => null);
  if (!confessionChannel || !confessionChannel.isSendable()) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Error", "The confession channel is not accessible.")),
    );
    return;
  }

  const number = await nextConfessionNumber(services, guildId);
  const prevNumber = number > 1 ? number - 1 : null;
  if (prevNumber) {
    const prevMeta = await getConfession(services, guildId, prevNumber);
    if (prevMeta && prevMeta.messageId && confessionChannel.isTextBased()) {
      const prevMsg = await confessionChannel.messages.fetch(prevMeta.messageId).catch(() => null);
      if (prevMsg) {
        const strippedPayload = confessionPayload(
          prevMeta.number,
          prevMeta.text,
          prevMeta.imageUrl,
          prevMeta.title,
          false,
        );
        await prevMsg.edit(strippedPayload).catch(() => null);
      }
    }
  }

  const sent = await confessionChannel.send(
    confessionPayload(number, text, imageUrl, title, true),
  );

  let threadId: string | null = null;
  if (config.autoThread && "startThread" in sent) {
    const thread = await sent.startThread({
      name: `Confession #${number}`,
      autoArchiveDuration: 1440,
    }).catch(() => null);
    threadId = thread?.id ?? null;
  }

  if (config.logChannelId) {
    const auditLines = [
      `**Author Hash:** \`${hash}\``,
      title ? `**Title:** ${title}` : null,
      `**Content:** ${text}`,
    ]
      .filter(Boolean)
      .join("\n");
    const logChannel = await services.client.channels.fetch(config.logChannelId).catch(() => null);
    if (logChannel && logChannel.isSendable()) {
      await logChannel.send(
        makeWarningCard(`🕊️ Moderator Audit - Confession #${number}`, auditLines, {
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

  await interaction.editReply(
    ephemeralCard(
      makeSuccessCard(
        "Confession Posted",
        `Posted anonymously as **Confession #${number}**.`,
      ),
    ),
  );
}

async function handleReply(
  services: Container,
  interaction: ModalSubmitInteraction,
  guildId: string,
  number: number,
  parentK: number | null,
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const config = await getConfessionsConfig(services, guildId);
  const meta = await getConfession(services, guildId, number);
  if (!meta) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Gone", "That confession no longer exists.")),
    );
    return;
  }

  const hash = await authorHashFor(services, guildId, interaction.user.id);
  if (await isBanned(services, guildId, hash)) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard("Blocked", "You can no longer participate in confessions here."),
      ),
    );
    return;
  }

  const text = interaction.fields.getTextInputValue("reply").trim();
  if (!text) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Empty", "Your reply was empty.")),
    );
    return;
  }

  if (!config.channelId) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard("Not Configured", "The confession channel is not configured."),
      ),
    );
    return;
  }

  let imageUrl: string | null = null;
  if (config.allowAttachments) {
    try {
      const rawImage = interaction.fields.getTextInputValue("image");
      imageUrl = sanitizeAttachmentUrl(rawImage);
    } catch {
      imageUrl = null;
    }
  }

  let parentRef: { label: string; quote: string | null } | undefined;
  if (parentK !== null) {
    const parent = await getReply(services, guildId, number, parentK);
    if (parent) {
      const truncated =
        parent.text.length > 150 ? `${parent.text.slice(0, 150)}...` : parent.text;
      parentRef = {
        label: `In reply to Reply #${number}.${parentK}`,
        quote: truncated.split("\n").map((l) => `> ${l}`).join("\n"),
      };
    }
  } else {
    const truncated =
      meta.text.length > 150 ? `${meta.text.slice(0, 150)}...` : meta.text;
    parentRef = {
      label: `In reply to Confession #${number}`,
      quote: truncated.split("\n").map((l) => `> ${l}`).join("\n"),
    };
  }

  const isOp = hash === meta.authorHash;
  const k = await nextReplyNumber(services, guildId, number);
  const targetChannelId = meta.threadId ?? config.channelId;
  const targetChannel = await services.client.channels.fetch(targetChannelId).catch(() => null);
  if (!targetChannel || !targetChannel.isSendable()) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Unavailable", "Could not post your reply.")),
    );
    return;
  }

  const payload = replyPayload(number, k, text, imageUrl, isOp, parentRef);
  const sent = await targetChannel.send(payload);
  if (!sent) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Unavailable", "Could not post your reply.")),
    );
    return;
  }

  if (config.logChannelId) {
    const auditLines = [
      `**Author Hash:** \`${hash}\``,
      `**Confession:** Confession #${number}`,
      `**Content:** ${text}`,
    ].join("\n");
    const logChannel = await services.client.channels.fetch(config.logChannelId).catch(() => null);
    if (logChannel && logChannel.isSendable()) {
      await logChannel.send(
        makeWarningCard(`💬 Moderator Audit - Reply #${number}.${k}`, auditLines, {
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

  await notifyTarget(services, guildId, {
    replyDm: config.replyDm,
    number,
    parentK,
    replierId: interaction.user.id,
    replyText: text,
    jumpUrl: `https://discord.com/channels/${guildId}/${targetChannelId}/${sent.id}`,
    isOp,
  });

  await interaction.editReply(
    ephemeralCard(
      makeSuccessCard(
        "Reply Posted",
        `Posted anonymously as **Reply #${number}.${k}**.`,
      ),
    ),
  );
}

export const confessModal = defineInteraction<ModalSubmitInteraction>({
  prefix: [
    "confessions:modal:new",
    "confessions:modal:reply",
    "confessions:modal:replyto",
  ],
  kinds: ["modal"],
  module: MODULE_NAME,
  async run(services: Container, interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inGuild() || !interaction.guildId) return;
    const guildId = interaction.guildId;
    const parts = interaction.customId.split(":");
    const kind = parts[2];
    const number = Number(parts[3]);
    const parentK = parts[4] !== undefined ? Number(parts[4]) : null;

    if (kind === "new") {
      await handleNew(services, interaction, guildId);
      return;
    }
    if ((kind === "reply" || kind === "replyto") && Number.isInteger(number)) {
      await handleReply(
        services,
        interaction,
        guildId,
        number,
        Number.isInteger(parentK) ? parentK : null,
      );
      return;
    }
  },
});
