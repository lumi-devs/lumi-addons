import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
  container,
} from "@sapphire/framework";
import type {
  Guild,
  ModalSubmitInteraction,
  SendableChannels,
} from "discord.js";
import {
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from "@discordjs/builders";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
  noPingCard,
  type CardReply,
} from "#utilities/cards.js";
import { getConfessionsConfig } from "../lib/config.js";
import {
  authorHashFor,
  getConfession,
  isBanned,
  nextConfessionNumber,
  nextReplyNumber,
  onCooldown,
  saveConfession,
  saveReplyAuthor,
  setCooldown,
} from "../lib/data.js";
import { buildConfessionCard, buildReplyCard } from "../lib/ui.js";

type Parsed =
  | { kind: "new" }
  | { kind: "reply"; number: number }
  | { kind: "replyto"; number: number; parentMessageId: string };

const NO_PING = { allowedMentions: { parse: [] as never[] } };

const galleryFor = (imageUrl?: string | null) =>
  imageUrl
    ? new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imageUrl),
      )
    : undefined;

interface UploadedFile {
  url: string;
  name: string;
}

function getUploadedFile(
  interaction: ModalSubmitInteraction,
): UploadedFile | null {
  try {
    const files = (interaction.fields as any).getUploadedFiles("image_upload");
    if (files) {
      const first = files.first();
      if (first) {
        return {
          url: first.url,
          name: first.name,
        };
      }
    }
    return null;
  } catch (err) {
    container.logger.error("[Confessions] Error getting uploaded files:", err);
    return null;
  }
}

async function rehostAttachment(
  guild: Guild,
  mediaChannelId: string,
  url: string,
  fileName: string,
): Promise<string> {
  try {
    const channel = await guild.channels
      .fetch(mediaChannelId)
      .catch(() => null);
    if (channel && channel.isTextBased() && "send" in channel) {
      const res = await fetch(url);
      if (!res.ok) return url;
      const buffer = await res.arrayBuffer();
      const file = {
        attachment: Buffer.from(buffer),
        name: fileName || "image.png",
      };

      const sent = await channel.send({
        files: [file],
      });
      const rehostedAttachment = sent.attachments.first();
      return rehostedAttachment ? rehostedAttachment.url : url;
    }
  } catch (err) {
    container.logger.error("[Confessions] Failed to rehost attachment:", err);
  }
  return url;
}

function extractBodyFromV2Message(msg: any): string {
  try {
    const container = msg.components?.[0];
    if (!container || container.type !== 20) return "";
    const textComponents = container.children?.filter(
      (c: any) => c.type === 21,
    );
    if (!textComponents || textComponents.length === 0) return "";
    const bodyComponents = textComponents.filter(
      (c: any) =>
        c.content &&
        !c.content.startsWith("##") &&
        !c.content.startsWith("-#") &&
        !c.content.startsWith(">"),
    );
    return bodyComponents[bodyComponents.length - 1]?.content ?? "";
  } catch {
    return "";
  }
}

async function stripPrevConfessButton(
  guildId: string,
  prevNumber: number,
  channel: any,
): Promise<void> {
  try {
    const prevMeta = await getConfession(guildId, prevNumber);
    if (!prevMeta || !prevMeta.messageId) return;

    const prevMessage = await channel.messages
      .fetch(prevMeta.messageId)
      .catch(() => null);
    if (!prevMessage) return;

    await prevMessage.edit({
      ...buildConfessionCard(
        prevNumber,
        prevMeta.text || "",
        prevMeta.imageUrl,
        prevMeta.title,
        false,
      ),
    });
  } catch (err) {
    container.logger.error("Failed to strip previous confess button:", err);
  }
}

@ApplyOptions<InteractionHandler.Options>({
  name: "confessions-modals",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class ConfessionModalHandler extends InteractionHandler {
  public override parse(interaction: ModalSubmitInteraction) {
    if (interaction.customId === "confess:new")
      return this.some({ kind: "new" } as Parsed);
    if (interaction.customId.startsWith("confess:replymodal:")) {
      const number = Number(interaction.customId.split(":")[2]);
      if (Number.isInteger(number))
        return this.some({ kind: "reply", number } as Parsed);
    }
    if (interaction.customId.startsWith("confess:replytomodal:")) {
      const parts = interaction.customId.split(":");
      const number = Number(parts[2]);
      const parentMessageId = parts[3];
      if (Number.isInteger(number) && parentMessageId)
        return this.some({
          kind: "replyto",
          number,
          parentMessageId,
        } as Parsed);
    }
    return this.none();
  }

  public async run(interaction: ModalSubmitInteraction, data: Parsed) {
    if (!interaction.inGuild() || !interaction.guild) return;
    if (data.kind === "new") {
      return this.#handleNew(interaction, interaction.guild);
    }
    if (data.kind === "reply") {
      return this.#handleReply(interaction, interaction.guild, data.number);
    }
    if (data.kind === "replyto") {
      return this.#handleReplyTo(
        interaction,
        interaction.guild,
        data.number,
        data.parentMessageId,
      );
    }

    throw new Error(`Unhandled modal kind: ${(data as any).kind}`);
  }

  async #handleNew(interaction: ModalSubmitInteraction, guild: Guild) {
    const config = await getConfessionsConfig(guild.id);
    const channel = config.channelId
      ? await resolveSendable(guild, config.channelId)
      : null;
    if (!channel)
      return this.#say(
        interaction,
        makeWarningCard(
          "Unavailable",
          "The confession channel is not set or not reachable.",
        ),
      );

    const hash = await authorHashFor(guild.id, interaction.user.id);
    if (await isBanned(guild.id, hash))
      return this.#say(
        interaction,
        makeErrorCard("Blocked", "You can no longer submit confessions here."),
      );
    if (await onCooldown(guild.id, hash))
      return this.#say(
        interaction,
        makeWarningCard("Slow Down", "You're on cooldown — try again shortly."),
      );

    const title = fieldOr(interaction, "title").trim() || null;
    const text = interaction.fields.getTextInputValue("confession").trim();
    if (!text)
      return this.#say(
        interaction,
        makeErrorCard("Empty", "Your confession was empty."),
      );

    const uploaded = config.allowAttachments
      ? getUploadedFile(interaction)
      : null;
    let imageUrl = uploaded ? uploaded.url : null;

    if (imageUrl && uploaded && config.mediaChannelId) {
      imageUrl = await rehostAttachment(
        guild,
        config.mediaChannelId,
        imageUrl,
        uploaded.name,
      );
    }

    const number = await nextConfessionNumber(guild.id);

    const prevNumber = number - 1;
    if (prevNumber > 0) {
      stripPrevConfessButton(guild.id, prevNumber, channel).catch(() => null);
    }

    const message = await channel.send({
      ...buildConfessionCard(number, text, imageUrl, title, true),
      ...NO_PING,
    });

    let threadId: string | null = null;
    if (config.autoThread && "startThread" in message) {
      const thread = await message
        .startThread({ name: `Confession #${number}` })
        .catch(() => null);
      threadId = thread?.id ?? null;
    }

    if (config.logChannelId) {
      const modLog = await resolveSendable(guild, config.logChannelId);
      if (modLog) {
        await modLog
          .send(
            noPingCard(
              makeWarningCard(
                `🕊️ Moderator Audit — Confession #${number}`,
                [
                  `**Author Hash:** \`${hash}\``,
                  title ? `**Title:** ${title}` : null,
                  `**Content:** ${text}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
                {
                  mediaGallery: imageUrl ? galleryFor(imageUrl) : undefined,
                },
              ),
            ),
          )
          .catch(() => null);
      }
    }

    await saveConfession(guild.id, {
      number,
      messageId: message.id,
      threadId,
      authorHash: hash,
      createdAt: Date.now(),
      title,
      text,
      imageUrl,
    });
    await setCooldown(guild.id, hash, config.cooldownMinutes);

    return this.#say(
      interaction,
      makeSuccessCard(
        "Confession Posted",
        `Posted anonymously as **Confession #${number}**.`,
      ),
    );
  }

  async #handleReply(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    number: number,
  ) {
    const config = await getConfessionsConfig(guild.id);
    const meta = await getConfession(guild.id, number);
    if (!meta)
      return this.#say(
        interaction,
        makeErrorCard("Gone", "That confession no longer exists."),
      );

    const hash = await authorHashFor(guild.id, interaction.user.id);
    if (await isBanned(guild.id, hash))
      return this.#say(
        interaction,
        makeErrorCard(
          "Blocked",
          "You can no longer participate in confessions here.",
        ),
      );

    const text = interaction.fields.getTextInputValue("reply").trim();
    if (!text)
      return this.#say(
        interaction,
        makeErrorCard("Empty", "Your reply was empty."),
      );

    const uploaded = config.allowAttachments
      ? getUploadedFile(interaction)
      : null;
    let imageUrl = uploaded ? uploaded.url : null;

    if (imageUrl && uploaded && config.mediaChannelId) {
      imageUrl = await rehostAttachment(
        guild,
        config.mediaChannelId,
        imageUrl,
        uploaded.name,
      );
    }

    const target =
      (meta.threadId && (await resolveSendable(guild, meta.threadId))) ||
      (config.channelId && (await resolveSendable(guild, config.channelId))) ||
      null;
    if (!target)
      return this.#say(
        interaction,
        makeErrorCard(
          "Unavailable",
          "The confession thread is no longer reachable.",
        ),
      );

    const isOp = hash === meta.authorHash;
    const k = await nextReplyNumber(guild.id, number);

    const replyMessage = await target.send({
      ...buildReplyCard(number, k, text, imageUrl, isOp, null, null),
      ...NO_PING,
    });

    await replyMessage
      .edit({
        ...buildReplyCard(
          number,
          k,
          text,
          imageUrl,
          isOp,
          null,
          replyMessage.id,
        ),
      })
      .catch(() => null);

    if (config.logChannelId) {
      const modLog = await resolveSendable(guild, config.logChannelId);
      if (modLog) {
        await modLog
          .send(
            noPingCard(
              makeWarningCard(
                `💬 Moderator Audit — Reply #${number}.${k}`,
                [
                  `**Author Hash:** \`${hash}\``,
                  `**Confession:** Confession #${number}`,
                  `**Content:** ${text}`,
                ].join("\n"),
                {
                  mediaGallery: imageUrl ? galleryFor(imageUrl) : undefined,
                },
              ),
            ),
          )
          .catch(() => null);
      }
    }

    await saveReplyAuthor(guild.id, replyMessage.id, hash);

    return this.#say(
      interaction,
      makeSuccessCard(
        "Reply Posted",
        `Posted anonymously as **Reply #${number}.${k}**.`,
      ),
    );
  }

  async #handleReplyTo(
    interaction: ModalSubmitInteraction,
    guild: Guild,
    number: number,
    parentMessageId: string,
  ) {
    const config = await getConfessionsConfig(guild.id);
    const meta = await getConfession(guild.id, number);
    if (!meta)
      return this.#say(
        interaction,
        makeErrorCard("Gone", "That confession no longer exists."),
      );

    const hash = await authorHashFor(guild.id, interaction.user.id);
    if (await isBanned(guild.id, hash))
      return this.#say(
        interaction,
        makeErrorCard(
          "Blocked",
          "You can no longer participate in confessions here.",
        ),
      );

    const text = interaction.fields.getTextInputValue("reply").trim();
    if (!text)
      return this.#say(
        interaction,
        makeErrorCard("Empty", "Your reply was empty."),
      );

    const uploaded = config.allowAttachments
      ? getUploadedFile(interaction)
      : null;
    let imageUrl = uploaded ? uploaded.url : null;

    if (imageUrl && uploaded && config.mediaChannelId) {
      imageUrl = await rehostAttachment(
        guild,
        config.mediaChannelId,
        imageUrl,
        uploaded.name,
      );
    }

    const thread = meta.threadId
      ? await resolveSendable(guild, meta.threadId)
      : null;
    if (!thread || !("messages" in thread))
      return this.#say(
        interaction,
        makeErrorCard(
          "Unavailable",
          "The confession thread is no longer reachable.",
        ),
      );

    const parentMessage = await thread.messages
      .fetch(parentMessageId)
      .catch(() => null);
    const parentText = parentMessage
      ? extractBodyFromV2Message(parentMessage)
      : "";
    const truncated =
      parentText.slice(0, 150) + (parentText.length > 150 ? "..." : "");
    const parentQuote = truncated
      ? truncated
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n")
      : null;

    const isOp = hash === meta.authorHash;
    const k = await nextReplyNumber(guild.id, number);

    const replyMessage = await thread.send({
      ...buildReplyCard(number, k, text, imageUrl, isOp, parentQuote, null),
      reply: parentMessage
        ? { messageReference: parentMessageId, failIfNotExists: false }
        : undefined,
      ...NO_PING,
    });

    await replyMessage
      .edit({
        ...buildReplyCard(
          number,
          k,
          text,
          imageUrl,
          isOp,
          parentQuote,
          replyMessage.id,
        ),
      })
      .catch(() => null);

    if (config.logChannelId) {
      const modLog = await resolveSendable(guild, config.logChannelId);
      if (modLog) {
        await modLog
          .send(
            noPingCard(
              makeWarningCard(
                `💬 Moderator Audit — ReplyTo #${number}.${k}`,
                [
                  `**Author Hash:** \`${hash}\``,
                  `**Confession:** Confession #${number}`,
                  `**Parent Message:** ${parentMessage ? parentMessage.url : "Unknown"}`,
                  `**Content:** ${text}`,
                ].join("\n"),
                {
                  mediaGallery: imageUrl ? galleryFor(imageUrl) : undefined,
                },
              ),
            ),
          )
          .catch(() => null);
      }
    }

    await saveReplyAuthor(guild.id, replyMessage.id, hash);

    return this.#say(
      interaction,
      makeSuccessCard(
        "Reply Posted",
        `Posted anonymously as **Reply #${number}.${k}**.`,
      ),
    );
  }

  #say(interaction: ModalSubmitInteraction, card: CardReply) {
    return interaction.reply(ephemeralCard(card));
  }
}

/** Resolve a guild channel that can receive messages, or null. */
async function resolveSendable(
  guild: Guild,
  channelId: string,
): Promise<SendableChannels | null> {
  try {
    const channel =
      guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    return channel && channel.isSendable() ? channel : null;
  } catch {
    return null;
  }
}

/** Read an optional modal field, tolerating its absence. */
function fieldOr(interaction: ModalSubmitInteraction, id: string): string {
  try {
    return interaction.fields.getTextInputValue(id);
  } catch {
    return "";
  }
}
