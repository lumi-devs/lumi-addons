import { container } from "@sapphire/framework";
import type { DragmeRevokePayload } from "../scheduled-tasks/dragmeRevoke.js";

/** Reverts the temporary connect overwrite granted on accept. */
export async function handleDragmeRevokeFire(
  payload: DragmeRevokePayload,
): Promise<void> {
  const guild =
    container.client.guilds.cache.get(payload.guildId) ??
    (await container.client.guilds.fetch(payload.guildId).catch(() => null));
  const channel = guild
    ? (guild.channels.cache.get(payload.channelId) ??
      (await guild.channels.fetch(payload.channelId).catch(() => null)))
    : null;
  if (!channel || !channel.isVoiceBased()) return;

  const { DragmeKeys } = await import("../keys.js");
  const key = DragmeKeys.tempPerm(
    payload.guildId,
    payload.channelId,
    payload.userId,
  );
  await container.redis.del(key);

  const overwrite = channel.permissionOverwrites.cache.get(payload.userId);
  if (!overwrite) return;
  await overwrite.delete("Dragme temporary access expired").catch((err) => {
    container.logger.warn(
      `[Dragme] Failed to revoke overwrite for ${payload.userId} on ${payload.channelId}:`,
      err,
    );
  });
}
