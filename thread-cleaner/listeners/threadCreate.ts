import { ApplyOptions } from "@sapphire/decorators";
import { Listener, Events } from "@sapphire/framework";
import { ThreadChannel } from "discord.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { threadCleanupJobId } from "../lib/keys.js";
import { parseDuration } from "#utilities/time.js";
import { getService } from "#core/module-system/Service.js";
import { isModuleEnabled } from "#utilities/listeners.js";

@ApplyOptions<Listener.Options>({
  event: Events.ThreadCreate,
})
export class ThreadCreateListener extends Listener {
  public async run(thread: ThreadChannel) {
    if (!thread.guild) return;
    if (!(await isModuleEnabled(thread.guild.id, "thread-cleaner"))) return;

    const enabledChannels = await getService("config").getConfigList(
      thread.guild.id,
      "thread-cleaner",
      "enabled_channels",
    );
    const parentChannelId = thread.parentId;

    if (!parentChannelId || !enabledChannels.includes(parentChannelId)) {
      return;
    }

    const inactiveDurationStr =
      ((await this.container.db.config.getModuleConfig(
        thread.guild.id,
        "thread-cleaner",
        "inactive_duration",
      )) as string | null) ?? "3d";
    const durationSeconds = parseDuration(inactiveDurationStr);

    if (durationSeconds === null) {
      this.container.logger.warn(
        `[ThreadCleaner] Invalid duration format "${inactiveDurationStr}" for guild ${thread.guild.id}`,
      );
      return;
    }

    const delay = durationSeconds * 1000;
    const archiveAt = new Date(Date.now() + delay);

    try {
      // One delayed BullMQ job per thread; the stable jobId makes re-creation
      // idempotent and survives restarts (BullMQ persists it in Redis).
      await scheduleTask(
        "thread-cleaner-task",
        { threadId: thread.id, guildId: thread.guild.id },
        {
          repeated: false,
          delay,
          customJobOptions: {
            jobId: threadCleanupJobId(thread.id),
            removeOnComplete: true,
            removeOnFail: true,
          },
        },
      );
      this.container.logger.debug(
        `[ThreadCleaner] Scheduled cleanup for thread ${thread.id} in guild ${thread.guild.id} at ${archiveAt.toISOString()}.`,
      );
    } catch (error) {
      this.container.logger.error(
        `[ThreadCleaner] Failed to schedule cleanup for thread ${thread.id} in guild ${thread.guild.id}`,
        error,
      );
    }
  }
}
