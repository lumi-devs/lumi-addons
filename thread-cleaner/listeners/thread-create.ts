import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import { Events, type ThreadChannel } from "discord.js";
import { getConfig } from "../config.js";
import { ModuleName, StateKey } from "../constants.js";
import type { ThreadState } from "../state.js";

export const threadCreateListener: ListenerDefinition = {
  event: Events.ThreadCreate,
  async handler(
    thread: ThreadChannel,
    _newlyCreated: boolean,
    services: ModuleServices,
  ) {
    const guildId = thread.guildId;
    if (!guildId) return;
    if (!services.modules.isEnabled(guildId, ModuleName)) return;

    const parentId = thread.parentId;
    if (!parentId) return;

    const config = await getConfig(services, guildId);
    if (!config.enabledChannelIds.includes(parentId)) return;

    const createdAt = Date.now();
    const state: ThreadState = {
      parentId,
      dueAt: createdAt + config.inactiveDurationMinutes * 60_000,
      action: config.action,
      createdAt,
    };

    await services.helpers.moduleData
      .set(guildId, ModuleName, thread.id, StateKey, state)
      .catch((error: unknown) => {
        services.observability.logger.warn(
          "thread-cleaner failed to track thread",
          { guildId, threadId: thread.id, error },
        );
      });
  },
};
