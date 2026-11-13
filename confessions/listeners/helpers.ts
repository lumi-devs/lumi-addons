import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  cardMessage,
  ephemeralCard,
  makeErrorCard,
  makeWarningCard,
  type CardReply,
} from "@lumi/ui";
import {
  MessageFlags,
  type Interaction,
  type SendableChannels,
} from "discord.js";
import { ModuleName } from "../config.js";
import type { ConfessionRecord } from "../data.js";

export async function deferEphemeral(
  interaction: Interaction,
): Promise<void> {
  if (!interaction.isRepliable() || interaction.deferred || interaction.replied) {
    return;
  }
  await interaction
    .deferReply({ flags: MessageFlags.Ephemeral })
    .catch(() => undefined);
}

export async function replyEphemeral(
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

export async function requireGuild(
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

export function isImageUpload(
  upload: { contentType: string | null } | null,
): boolean {
  return (
    upload === null ||
    upload.contentType === null ||
    upload.contentType.startsWith("image/")
  );
}

export function isReplyPath(value: string | undefined): value is string {
  return typeof value === "string" && /^\d+\.\d+(?:\.\d+)*$/.test(value);
}

export async function resolveReplyChannel(
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

export async function sendModeratorAudit(
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
