import { getModuleConfig } from "lumi/config";
import { channels } from "lumi/discord";
import { noPingCard, type CardReply } from "lumi/ui";

export async function sendLog(guildId: string, card: CardReply): Promise<void> {
  const logChannelId = await getModuleConfig("log_channel_id", guildId);
  if (!logChannelId || typeof logChannelId !== "string") return;
  await channels.send(logChannelId, noPingCard(card)).catch(() => null);
}
