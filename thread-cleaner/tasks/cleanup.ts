import type { ModuleServices, TaskDefinition } from "@lumi/module-kit";
import { ModuleName, StateKey } from "../constants.js";
import {
  deleteThreadState,
  type ThreadState,
  ThreadStateSchema,
} from "../state.js";

const ScanLimit = 2_000;
const BatchLimit = 100;

function errorCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  const code = error.code;
  if (typeof code === "number") return code;
  if (typeof code === "string" && /^\d+$/.test(code)) return Number(code);
  return null;
}

function isUnknownChannelError(error: unknown): boolean {
  const code = errorCode(error);
  return code === 10_003 || code === 10_008;
}

async function processThread(
  services: ModuleServices,
  guildId: string,
  threadId: string,
  state: ThreadState,
): Promise<void> {
  try {
    const channel = await services.client.channels.fetch(threadId, {
      force: true,
    });
    if (!channel?.isThread()) {
      await deleteThreadState(services, guildId, threadId);
      return;
    }

    if (state.action === "lock") {
      await channel.setLocked(true);
    }
    await channel.setArchived(true);
    await deleteThreadState(services, guildId, threadId);
  } catch (error) {
    if (isUnknownChannelError(error)) {
      await deleteThreadState(services, guildId, threadId);
      return;
    }
    services.observability.logger.warn(
      "thread-cleaner failed to clean up thread",
      { guildId, threadId, error },
    );
  }
}

export const cleanupTask: TaskDefinition = {
  name: "cleanup-inactive-threads",
  cron: "*/5 * * * *",
  timezone: "UTC",
  async handler(services) {
    const guilds = [...services.client.guilds.cache.values()]
      .filter((guild) => services.modules.isEnabled(guild.id, ModuleName))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (guilds.length === 0) return;

    const offset = Math.floor(Date.now() / 300_000) % guilds.length;
    const ordered = guilds.slice(offset).concat(guilds.slice(0, offset));
    const now = Date.now();
    const queues = new Map<
      string,
      Array<{ guildId: string; targetId: string; value: unknown }>
    >();
    let work = 0;
    let progressed = true;

    while (work < BatchLimit && progressed) {
      progressed = false;

      for (const guild of ordered) {
        if (work >= BatchLimit) break;

        let queue = queues.get(guild.id);
        if (!queue) {
          queue = await services.helpers.moduleData.list<unknown>({
            guildId: guild.id,
            moduleName: ModuleName,
            key: StateKey,
            limit: ScanLimit,
          });
          queues.set(guild.id, queue);
        }

        while (queue.length > 0 && work < BatchLimit) {
          const entry = queue.shift();
          if (!entry) break;

          const parsed = ThreadStateSchema.safeParse(entry.value);
          if (!parsed.success) {
            work += 1;
            progressed = true;
            await deleteThreadState(services, entry.guildId, entry.targetId);
            break;
          }

          if (parsed.data.dueAt > now) continue;

          work += 1;
          progressed = true;
          await processThread(
            services,
            entry.guildId,
            entry.targetId,
            parsed.data,
          );
          break;
        }
      }
    }
  },
};
