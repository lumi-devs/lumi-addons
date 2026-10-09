import { logger } from "lumi";
import { getModuleConfig } from "lumi/config";
import { threads } from "lumi/discord";
import { get, set } from "lumi/kv";
import { THREAD_STATE_KEY, type ThreadState } from "./keys.js";

export async function handleThreadCleanup(
  payload: Record<string, unknown>,
): Promise<void> {
  const threadId = payload["threadId"];
  const guildId = payload["guildId"];
  if (typeof threadId !== "string" || typeof guildId !== "string") return;

  const state = await get<ThreadState>(guildId, threadId, THREAD_STATE_KEY).catch(
    () => null,
  );
  if (state?.status === "completed") return;

  const action =
    state?.action ??
    ((await getModuleConfig("action", guildId)) as "archive" | "lock" | null) ??
    "archive";

  try {
    await threads.archive(threadId, action === "lock");
  } catch (err: unknown) {
    logger.warn(`[thread-cleaner] failed to ${action} thread ${threadId}: ${String(err)}`);
  }

  await set<ThreadState>(guildId, threadId, THREAD_STATE_KEY, {
    parentId: state?.parentId ?? "",
    action,
    scheduledAt: state?.scheduledAt ?? 0,
    dueAt: state?.dueAt ?? 0,
    status: "completed",
  }).catch(() => null);
}
