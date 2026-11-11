import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import { Events, type Message } from "discord.js";
import { getConfig } from "../config.js";
import {
  ExtensionMarkerTtlMs,
  ModuleName,
  StateKey,
} from "../constants.js";
import { readThreadState, type ThreadState } from "../state.js";

export const messageCreateListener: ListenerDefinition = {
  event: Events.MessageCreate,
  async handler(message: Message, services: ModuleServices) {
    if (!message.inGuild() || !message.channel.isThread()) return;

    const guildId = message.guildId;
    if (!services.modules.isEnabled(guildId, ModuleName)) return;

    const threadId = message.channel.id;
    const state = await readThreadState(services, guildId, threadId);
    if (!state) return;

    const markerKey = `${ModuleName}:extend:${guildId}:${threadId}`;
    const acquired = await services.helpers.cache
      .setNx(markerKey, "1", ExtensionMarkerTtlMs)
      .catch(() => true);
    if (!acquired) return;

    const config = await getConfig(services, guildId);
    const nextState: ThreadState = {
      ...state,
      dueAt: Date.now() + config.inactiveDurationMinutes * 60_000,
    };

    await services.helpers.moduleData
      .set(guildId, ModuleName, threadId, StateKey, nextState)
      .catch((error: unknown) => {
        services.observability.logger.warn(
          "thread-cleaner failed to extend inactivity",
          { guildId, threadId, error },
        );
      });
  },
};
