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
    const entries = await services.helpers.moduleData.list<unknown>({
      moduleName: ModuleName,
      key: StateKey,
      limit: ScanLimit,
    });

    const now = Date.now();
    let work = 0;

    for (const entry of entries) {
      if (work >= BatchLimit) break;

      const parsed = ThreadStateSchema.safeParse(entry.value);
      if (!parsed.success) {
        work += 1;
        await deleteThreadState(services, entry.guildId, entry.targetId);
        continue;
      }

      if (parsed.data.dueAt > now) continue;
      if (!services.modules.isEnabled(entry.guildId, ModuleName)) continue;

      work += 1;
      await processThread(services, entry.guildId, entry.targetId, parsed.data);
    }
  },
};
