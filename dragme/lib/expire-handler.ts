import { messages } from "lumi/discord";
import type { ExpirePayload } from "../keys.js";
import { disabledRequestPayload, userMention } from "./cards.js";
import { getRequest, setRequest } from "./requests.js";

export async function handleDragmeExpireFire(
  payload: Record<string, unknown>,
): Promise<void> {
  const { requestId, guildId } = payload as Partial<ExpirePayload>;
  if (!requestId || !guildId) return;

  const req = await getRequest(guildId, requestId);
  if (!req || req.status !== "pending") return;

  req.status = "expired";
  await Promise.all([
    setRequest(req),
    setRequest({ ...req, requestId: req.requesterId }),
  ]);

  await messages
    .edit(
      req.cardChannelId,
      req.cardMessageId,
      disabledRequestPayload(
        req,
        "Drag Request Expired",
        `${userMention(req.requesterId)}'s request timed out with no response.`,
        "warning",
      ),
    )
    .catch(() => null);
}
