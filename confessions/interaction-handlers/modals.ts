import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type {
  Guild,
  ModalSubmitInteraction,
  SendableChannels,
} from "discord.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
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
import { sanitizeAttachmentUrl } from "../lib/anon.js";
import { buildConfessionCard, buildReplyCard } from "../lib/ui.js";

type Parsed = { kind: "new" } | { kind: "reply"; number: number };

const NO_PING = { allowedMentions: { parse: [] as never[] } };

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
    return this.none();
  }

  public async run(interaction: ModalSubmitInteraction, data: Parsed) {
    if (!interaction.inGuild() || !interaction.guild) return;
    return data.kind === "new"
      ? this.#handleNew(interaction, interaction.guild)
      : this.#handleReply(interaction, interaction.guild, data.number);
  }

  async #handleNew(interaction: ModalSubmitInteraction, guild: Guild) {
    const config = await getConfessionsConfig(guild.id);
    const channel = config.channelId
      ? resolveSendable(guild, config.channelId)
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

    const text = interaction.fields.getTextInputValue("confession").trim();
    if (!text)
      return this.#say(
        interaction,
        makeErrorCard("Empty", "Your confession was empty."),
      );
    const imageUrl = config.allowAttachments
      ? sanitizeAttachmentUrl(fieldOr(interaction, "image_url"))
      : null;

    const number = await nextConfessionNumber(guild.id);
    const message = await channel.send({
      ...buildConfessionCard(number, text, imageUrl),
      ...NO_PING,
    });

    let threadId: string | null = null;
    if (config.autoThread && "startThread" in message) {
      const thread = await message
        .startThread({ name: `Confession #${number}` })
        .catch(() => null);
      threadId = thread?.id ?? null;
    }

    await saveConfession(guild.id, {
      number,
      messageId: message.id,
      threadId,
      authorHash: hash,
      createdAt: Date.now(),
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
    const imageUrl = config.allowAttachments
      ? sanitizeAttachmentUrl(fieldOr(interaction, "image_url"))
      : null;

    const target =
      (meta.threadId && resolveSendable(guild, meta.threadId)) ||
      (config.channelId && resolveSendable(guild, config.channelId)) ||
      null;
    if (!target)
      return this.#say(
        interaction,
        makeErrorCard(
          "Unavailable",
          "The confession thread is no longer reachable.",
        ),
      );

    const k = await nextReplyNumber(guild.id, number);
    const replyMessage = await target.send({
      ...buildReplyCard(number, k, text, imageUrl),
      ...NO_PING,
    });
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
function resolveSendable(
  guild: Guild,
  channelId: string,
): SendableChannels | null {
  const channel = guild.channels.cache.get(channelId);
  return channel?.isSendable() ? channel : null;
}

/** Read an optional modal field, tolerating its absence. */
function fieldOr(interaction: ModalSubmitInteraction, id: string): string {
  try {
    return interaction.fields.getTextInputValue(id);
  } catch {
    return "";
  }
}
