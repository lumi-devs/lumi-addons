import type { Container } from "@lumi-devs/lumi/services";
import { noPingCard, type CardReply } from "@lumi-devs/lumi/ui";
import { MODULE_NAME } from "./Keys.js";

export async function sendLog(
  services: Container,
  guildId: string,
  card: CardReply,
): Promise<void> {
  const logChannelId = await services.db.config.getModuleConfig(
    guildId,
    MODULE_NAME,
    "log_channel_id",
  );
  if (!logChannelId || typeof logChannelId !== "string") return;
  const channel = await services.client.channels
    .fetch(logChannelId)
    .catch(() => null);
  if (!channel || !channel.isSendable()) return;
  await channel.send(noPingCard(card)).catch(() => null);
}
