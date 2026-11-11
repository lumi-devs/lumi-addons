import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import { Events, type ThreadChannel } from "discord.js";
import { deleteThreadState } from "../state.js";

export const threadDeleteListener: ListenerDefinition = {
  event: Events.ThreadDelete,
  async handler(thread: ThreadChannel, services: ModuleServices) {
    const guildId = thread.guildId;
    if (!guildId) return;

    await deleteThreadState(services, guildId, thread.id);
  },
};
