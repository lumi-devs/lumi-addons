import { container } from "@sapphire/framework";
import type { DragmeRevokePayload } from "../scheduled-tasks/dragmeRevoke.js";

/** Reverts the temporary connect overwrite granted on accept. */
export async function handleDragmeRevokeFire(
  payload: DragmeRevokePayload,
): Promise<void> {
  const guild = container.client.guilds.cache.get(payload.guildId);
  const channel = guild?.channels.cache.get(payload.channelId);
  if (!channel?.isVoiceBased()) return;

  const overwrite = channel.permissionOverwrites.cache.get(payload.userId);
  if (!overwrite) return;
  await overwrite.delete("Dragme temporary access expired").catch((err) => {
    container.logger.warn(
      `[Dragme] Failed to revoke overwrite for ${payload.userId} on ${payload.channelId}:`,
      err,
    );
  });
}
