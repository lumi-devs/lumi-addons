import { container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import { DragmeKeys, type DragRequest } from "../keys.js";

export async function getRequest(
  guildId: string,
  userId: string,
): Promise<DragRequest | null> {
  const raw = await container.redis.get(DragmeKeys.request(guildId, userId));
  if (!raw) return null;
  const parsed = tryParseJSON(raw) as DragRequest | string;
  return typeof parsed === "string" ? null : parsed;
}

export async function setRequest(req: DragRequest): Promise<void> {
  const ttlSec = Math.max(1, Math.ceil((req.expiresAt - Date.now()) / 1000));
  await container.redis
    .multi()
    .set(
      DragmeKeys.request(req.guildId, req.userId),
      JSON.stringify(req),
      "EX",
      ttlSec,
    )
    .sadd(DragmeKeys.activeSet(req.guildId), req.userId)
    .exec();
}

export async function deleteRequest(
  guildId: string,
  userId: string,
): Promise<void> {
  await container.redis
    .multi()
    .del(DragmeKeys.request(guildId, userId))
    .srem(DragmeKeys.activeSet(guildId), userId)
    .exec();
}

/** Live requests for a guild; self-heals set members whose key expired. */
export async function listRequests(guildId: string): Promise<DragRequest[]> {
  const ids = await container.redis.smembers(DragmeKeys.activeSet(guildId));
  const out: DragRequest[] = [];
  for (const userId of ids) {
    const req = await getRequest(guildId, userId);
    if (req) out.push(req);
    else await container.redis.srem(DragmeKeys.activeSet(guildId), userId);
  }
  return out;
}
