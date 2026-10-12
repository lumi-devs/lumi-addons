import type { ThreadChannel } from "discord.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { defineListener } from "@lumi-devs/lumi/lib/listeners/ListenerDef.js";
import { scheduleOneshot } from "@lumi-devs/lumi/lib/scheduler/Oneshot.js";
import { toStringArray } from "@lumi-devs/lumi/lib/module-system/ConfigSchema.js";
import { defineModuleConfig } from "@lumi-devs/lumi/lib/module-system/ModuleConfig.js";
import { Duration } from "@sapphire/duration";
import type { ThreadState } from "../utilities/Keys.js";
import { THREAD_STATE_KEY, CLEANUP_ONESHOT } from "../utilities/Keys.js";

const threadCleanerConfig = defineModuleConfig("thread-cleaner", {
  enabled_channels: [] as string[],
  inactive_duration: "3d",
  action: "archive" as "archive" | "lock",
});

const threadCreate = defineListener({
  name: "threadCleanerThreadCreate",
  event: "threadCreate",
  module: "thread-cleaner",
  guildId: (thread: ThreadChannel) => thread.guildId ?? null,
  async execute(services: Container, thread: ThreadChannel): Promise<void> {
    const guildId = thread.guildId;
    if (!guildId) return;

    const config = threadCleanerConfig.forGuild(services, guildId);
    const enabledChannels = toStringArray(await config.get("enabled_channels"));
    const parentId = thread.parentId ?? "";

    if (!parentId || !enabledChannels.includes(parentId)) return;

    const durationStr = await config.get("inactive_duration");
    const delayMs = new Duration(durationStr).offset;
    if (!delayMs || delayMs <= 0) {
      services.logger.warn(
        `[thread-cleaner] Invalid duration "${durationStr}" in guild ${guildId}`,
      );
      return;
    }

    const action = await config.get("action");
    const now = Date.now();

    await services.db.guildKV
      .setModuleData<ThreadState>(guildId, "thread-cleaner", thread.id, THREAD_STATE_KEY, {
        parentId,
        action,
        scheduledAt: now,
        dueAt: now + delayMs,
        status: "pending",
      })
      .catch(() => null);

    await scheduleOneshot(
      services,
      "thread-cleaner",
      CLEANUP_ONESHOT,
      guildId,
      delayMs,
      { threadId: thread.id },
    ).catch((err: unknown) =>
      services.logger.error(
        `[thread-cleaner] Failed to schedule cleanup for thread ${thread.id}: ${String(err)}`,
      ),
    );
  },
});

export default threadCreate;
