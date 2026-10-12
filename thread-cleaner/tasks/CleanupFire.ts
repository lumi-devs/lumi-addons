import type { OneshotContext } from "@lumi-devs/lumi/lib/scheduler/Oneshot.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import type { ThreadState } from "../utilities/Keys.js";
import { THREAD_STATE_KEY, CLEANUP_ONESHOT } from "../utilities/Keys.js";

async function handleCleanupFire(
  services: Container,
  ctx: OneshotContext,
): Promise<void> {
  const payload = ctx.data as { threadId?: string } | null;
  const threadId = payload?.threadId;
  const guildId = ctx.guildId;
  if (!threadId) return;

  const state = await services.db.guildKV
    .getModuleData<ThreadState>(guildId, "thread-cleaner", threadId, THREAD_STATE_KEY)
    .catch(() => null);

  if (state?.status === "completed") return;

  const action = state?.action ?? "archive";

  const thread = await services.client.channels.fetch(threadId).catch(() => null);
  if (
    !thread ||
    !thread.isThread()
  ) return;

  if (action === "lock") {
    await thread.setLocked(true).catch(() => null);
  } else {
    await thread.setArchived(true).catch(() => null);
  }

  await services.db.guildKV
    .setModuleData<ThreadState>(guildId, "thread-cleaner", threadId, THREAD_STATE_KEY, {
      parentId: state?.parentId ?? "",
      action,
      scheduledAt: state?.scheduledAt ?? 0,
      dueAt: state?.dueAt ?? 0,
      status: "completed",
    })
    .catch(() => null);
}

export const oneshots = {
  [CLEANUP_ONESHOT]: handleCleanupFire,
};
