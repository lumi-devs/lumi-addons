// Worker-side fire handler for a per-thread `thread-cleaner-task` job. Fires
// once, when the thread's inactivity window elapses. The job is the only record
// of a pending cleanup (BullMQ persists it in Redis), so there is nothing to
// untrack — it auto-removes on completion.

import { container } from "@sapphire/framework";
import type { ThreadCleanerPayload } from "../scheduled-tasks/threadCleaner.js";

export async function handleThreadCleanerFire(
  payload: ThreadCleanerPayload,
): Promise<void> {
  const { threadId, guildId } = payload;

  // REST-fetches when uncached, so this is correct on any role/topology.
  const channel = await container.client.channels
    .fetch(threadId)
    .catch(() => null);

  // Thread deleted or no longer a thread — nothing to do.
  if (!channel || !channel.isThread()) return;
  // Already archived (manually, or by a previous run) — leave it be.
  if (channel.archived) return;

  const action =
    ((await container.db.config.getModuleConfig(
      guildId,
      "thread-cleaner",
      "action",
    )) as "archive" | "lock" | null) ?? "archive";

  try {
    if (action === "lock") {
      await channel.setLocked(true, "Automatic cleanup due to inactivity.");
      container.logger.info(
        `[ThreadCleaner] Locked thread ${threadId} in guild ${guildId}.`,
      );
    } else {
      await channel.setArchived(true, "Automatic cleanup due to inactivity.");
      container.logger.info(
        `[ThreadCleaner] Archived thread ${threadId} in guild ${guildId}.`,
      );
    }
  } catch (error) {
    container.logger.error(
      `[ThreadCleaner] Failed to process thread ${threadId} in guild ${guildId}`,
      error,
    );
    throw error;
  }
}
