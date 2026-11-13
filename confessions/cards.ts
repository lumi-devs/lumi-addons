import { cardMessage } from "@lumi/ui";
import type { ModuleServices } from "@lumi/module-kit";
import { getConfession } from "./data.js";
import { confessionCard } from "./ui.js";

export async function setConfessButton(
  services: ModuleServices,
  guildId: string,
  number: number,
  show: boolean,
  reportable: boolean,
): Promise<void> {
  const record = await getConfession(services, guildId, number).catch(
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
            show,
          ),
        ),
      ),
    )
    .catch(() => undefined);
}
