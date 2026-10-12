import type { Container } from "@lumi-devs/lumi/services";
import type { OneshotContext } from "@lumi-devs/lumi/scheduler";
import { channelMention, disabledPayload, userMention } from "../utilities/Cards.js";
import { getRequest, setRequest } from "../utilities/Requests.js";
import type { ExpireOneshotData } from "../utilities/Keys.js";

export async function handleExpire(
  services: Container,
  ctx: OneshotContext,
): Promise<void> {
  const { requestId } = ctx.data as ExpireOneshotData;
  if (!requestId) return;

  const req = await getRequest(services, ctx.guildId, requestId);
  if (!req || req.status !== "pending") return;

  req.status = "expired";
  await Promise.all([
    setRequest(services, req),
    setRequest(services, { ...req, requestId: req.requesterId }),
  ]);

  try {
    const channel = await services.client.channels.fetch(req.cardChannelId);
    if (!channel || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(req.cardMessageId);
    const payload = disabledPayload(
      req,
      "Drag Request Expired",
      `${userMention(req.requesterId)}'s request timed out with no response in ${channelMention(req.channelId)}.`,
      "warning",
    );
    await message.edit({
      components: [...payload.components],
      allowedMentions: { parse: [] },
    });
  } catch {
    // message already gone
  }
}
