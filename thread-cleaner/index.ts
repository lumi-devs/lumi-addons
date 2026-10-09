import { cfg, defineModule, logger, toStringArray } from "lumi";
import { getModuleConfig } from "lumi/config";
import { modules } from "lumi/discord";
import { onEvent } from "lumi/events";
import { set } from "lumi/kv";
import { registerTaskFireHandler, schedule } from "lumi/scheduling";
import { parseDuration } from "lumi/utils";
import { CLEANUP_TASK, MODULE_NAME, THREAD_STATE_KEY, type ThreadState } from "./lib/keys.js";
import { handleThreadCleanup } from "./lib/cleanup-handler.js";

export const meta = defineModule({
  name: "thread-cleaner",
  displayName: "Thread Cleaner",
  emoji: "🧹",
  version: "1.0.0",
  description: "Automatically archives or locks threads after a period of inactivity.",
  configSchema: cfg.object({
    enabled_channels: cfg.multiChannel({
      label: "Enabled Channels",
      description: "Channels where new threads should be scheduled for cleanup.",
    }),
    inactive_duration: cfg.duration({
      label: "Inactivity Duration",
      description: "Duration of inactivity before cleanup runs (e.g. '24h', '3d', '1w').",
      default: "3d",
    }),
    action: cfg.enum(["archive", "lock"], {
      label: "Cleanup Action",
      description: "Action to perform on the thread (archive or lock).",
      default: "archive",
    }),
  }),
});

onEvent("threadCreate", async (data) => {
  const guildId = data["guildId"] as string | undefined;
  const parentId = (data["parentId"] as string | undefined) ?? "";
  const threadId = data["threadId"] as string | undefined;
  if (!guildId || !threadId) return;

  const states = await modules.enabled(guildId, [MODULE_NAME]);
  if (!states[MODULE_NAME]) return;

  const enabledChannels = toStringArray(
    await getModuleConfig("enabled_channels", guildId),
  );
  if (!parentId || !enabledChannels.includes(parentId)) return;

  const durationStr =
    ((await getModuleConfig("inactive_duration", guildId)) as string | null) ??
    "3d";
  const delay = parseDuration(durationStr);
  if (delay === null || delay <= 0) {
    logger.warn(
      `[thread-cleaner] Invalid duration "${durationStr}" in guild ${guildId}`,
    );
    return;
  }

  const action =
    ((await getModuleConfig("action", guildId)) as "archive" | "lock" | null) ??
    "archive";

  const now = Date.now();
  await set<ThreadState>(guildId, threadId, THREAD_STATE_KEY, {
    parentId,
    action,
    scheduledAt: now,
    dueAt: now + delay,
    status: "pending",
  }).catch(() => null);

  await schedule(CLEANUP_TASK, { threadId, guildId }, { delay }).catch(
    (err: unknown) =>
      logger.error(
        `[thread-cleaner] Failed to schedule cleanup for thread ${threadId}: ${String(err)}`,
      ),
  );
});

registerTaskFireHandler(CLEANUP_TASK, handleThreadCleanup);
