import { container } from "@sapphire/framework";
import { noPingCard, type CardReply } from "#utilities/cards.js";
import { MODULE_NAME } from "./keys.js";

/**
 * Send a card to the guild's configured log channel (if any).
 * Mentions are always suppressed so logs never ping a role or member.
 */
export async function sendLog(guildId: string, card: CardReply): Promise<void> {
  const logChannelId = await container.db.config.getModuleConfig(
    guildId,
    MODULE_NAME,
    "log_channel_id",
  );
  if (!logChannelId || typeof logChannelId !== "string") return;

  const channel = container.client.channels.cache.get(logChannelId);
  if (!channel?.isTextBased() || !("send" in channel)) return;

  await channel.send(noPingCard(card)).catch(() => null);
}
