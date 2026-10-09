import type { InteractionContext } from "lumi/interactions";
import { makeWarningCard } from "lumi/ui";
import { attachments, channels, messages, threads } from "lumi/discord";
import { getConfessionsConfig } from "../lib/config.js";
import {
  authorHashFor,
  getConfession,
  getReply,
  isBanned,
  nextConfessionNumber,
  nextReplyNumber,
  onCooldown,
  saveConfession,
  saveReply,
  setCooldown,
} from "../lib/data.js";
import { confessionPayload, replyPayload } from "../lib/ui.js";

async function rehostUpload(
  ctx: InteractionContext,
  channelId: string,
): Promise<string | null> {
  const file = ctx.attachments["image"]?.[0];
  if (!file) return null;
  const rehosted = await attachments
    .rehost(file.url, file.filename, channelId)
    .catch(() => null);
  return rehosted?.url ?? null;
}

async function handleNew(ctx: InteractionContext, guildId: string): Promise<void> {
  await ctx.defer();
  const config = await getConfessionsConfig(guildId);
  if (!config.channelId) {
    return ctx.replyWarning(
      "Not Configured",
      "The confession channel is not configured.",
    );
  }

  const hash = await authorHashFor(guildId, ctx.user.id);
  if (await isBanned(guildId, hash)) {
    return ctx.replyError("Blocked", "You can no longer submit confessions here.");
  }
  if (await onCooldown(guildId, hash, config.cooldownMinutes)) {
    return ctx.replyWarning(
      "Slow Down",
      `Please wait before your next confession (cooldown: ${config.cooldownMinutes}m).`,
    );
  }

  const title = (ctx.fields["title"] ?? "").trim() || null;
  const text = (ctx.fields["confession"] ?? "").trim();
  if (!text) return ctx.replyError("Empty", "Your confession was empty.");

  const imageUrl = config.allowAttachments
    ? await rehostUpload(ctx, config.logChannelId ?? config.channelId)
    : null;

  const number = await nextConfessionNumber(guildId);
  const prevNumber = number > 1 ? number - 1 : null;
  if (prevNumber) {
    const prevMeta = await getConfession(guildId, prevNumber);
    if (prevMeta && prevMeta.messageId) {
      const strippedPayload = confessionPayload(
        prevMeta.number,
        prevMeta.text,
        prevMeta.imageUrl,
        prevMeta.title,
        false,
      );
      await messages.edit(config.channelId, prevMeta.messageId, strippedPayload).catch(() => null);
    }
  }

  const sent = await channels.send(
    config.channelId,
    confessionPayload(number, text, imageUrl, title, true),
  );

  const threadId = config.autoThread
    ? await threads
        .create(config.channelId, `Confession #${number}`, {
          messageId: sent.id,
          autoArchiveMinutes: 1440,
        })
        .then((t) => t.id)
        .catch(() => null)
    : null;

  if (config.logChannelId) {
    const auditLines = [
      `**Author Hash:** \`${hash}\``,
      title ? `**Title:** ${title}` : null,
      `**Content:** ${text}`,
    ]
      .filter(Boolean)
      .join("\n");
    await channels
      .send(
        config.logChannelId,
        makeWarningCard(`🕊️ Moderator Audit — Confession #${number}`, auditLines, {
          headerImages: imageUrl ? [imageUrl] : undefined,
        }),
      )
      .catch(() => null);
  }

  await saveConfession(guildId, {
    number,
    messageId: sent.id,
    threadId,
    authorHash: hash,
    createdAt: Date.now(),
    title,
    text,
    imageUrl,
  });
  await setCooldown(guildId, hash, config.cooldownMinutes);

  return ctx.replySuccess(
    "Confession Posted",
    `Posted anonymously as **Confession #${number}**.`,
  );
}

async function handleReply(
  ctx: InteractionContext,
  guildId: string,
  number: number,
  parentK: number | null,
): Promise<void> {
  await ctx.defer();
  const config = await getConfessionsConfig(guildId);
  const meta = await getConfession(guildId, number);
  if (!meta) {
    return ctx.replyError("Gone", "That confession no longer exists.");
  }

  const hash = await authorHashFor(guildId, ctx.user.id);
  if (await isBanned(guildId, hash)) {
    return ctx.replyError(
      "Blocked",
      "You can no longer participate in confessions here.",
    );
  }

  const text = (ctx.fields["reply"] ?? "").trim();
  if (!text) return ctx.replyError("Empty", "Your reply was empty.");

  if (!config.channelId) {
    return ctx.replyError(
      "Not Configured",
      "The confession channel is not configured.",
    );
  }

  const imageUrl = config.allowAttachments
    ? await rehostUpload(ctx, config.logChannelId ?? config.channelId)
    : null;

  let parentRef: { label: string; quote: string | null } | undefined;
  let parentMessageId: string | null = null;
  if (parentK !== null) {
    const parent = await getReply(guildId, number, parentK);
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
  const k = await nextReplyNumber(guildId, number);
  const targetChannel = meta.threadId ?? config.channelId;

  const payload = replyPayload(number, k, text, imageUrl, isOp, parentRef);
  const sendOpts = parentMessageId ? { replyTo: parentMessageId } : {};
  const sent = await channels.send(targetChannel, payload, sendOpts);
  if (!sent) {
    return ctx.replyError("Unavailable", "Could not post your reply.");
  }

  if (config.logChannelId) {
    const auditLines = [
      `**Author Hash:** \`${hash}\``,
      `**Confession:** Confession #${number}`,
      `**Content:** ${text}`,
    ].join("\n");
    await channels
      .send(
        config.logChannelId,
        makeWarningCard(`💬 Moderator Audit — Reply #${number}.${k}`, auditLines, {
          headerImages: imageUrl ? [imageUrl] : undefined,
        }),
      )
      .catch(() => null);
  }

  await saveReply(guildId, number, k, {
    number,
    k,
    authorHash: hash,
    text,
    createdAt: Date.now(),
    messageId: sent.id,
  });

  return ctx.replySuccess(
    "Reply Posted",
    `Posted anonymously as **Reply #${number}.${k}**.`,
  );
}

export default {
  prefix: "confessions:modal",
  run: async (ctx: InteractionContext) => {
    if (!ctx.guildId) return;
    const guildId = ctx.guildId;
    const parts = ctx.customId.split(":");
    const kind = parts[2];
    const number = Number(parts[3]);
    const parentK = parts[4] !== undefined ? Number(parts[4]) : null;

    if (kind === "new") return handleNew(ctx, guildId);
    if ((kind === "reply" || kind === "replyto") && Number.isInteger(number)) {
      return handleReply(
        ctx,
        guildId,
        number,
        Number.isInteger(parentK) ? parentK : null,
      );
    }
  },
};
