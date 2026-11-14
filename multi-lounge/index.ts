import {
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
  type TaskDefinition,
} from "@lumi/module-kit";
import type { VoiceState } from "discord.js";
import { loungeCommand } from "./commands/lounge.js";
import { ConfigSchema, ModuleName } from "./data.js";
import { handleVoiceState, reconcileGuild } from "./lounge.js";

const voiceStateListener: ListenerDefinition = {
  event: "voiceStateUpdate",
  async handler(
    oldState: VoiceState,
    newState: VoiceState,
    services: ModuleServices,
  ) {
    await handleVoiceState(services, oldState, newState).catch((error) => {
      services.observability.logger.warn(
        "multi-lounge voice state handling failed",
        {
          guildId: newState.guild?.id ?? oldState.guild?.id ?? null,
          error,
        },
      );
    });
  },
};

const reconcileTask: TaskDefinition = {
  name: "reconcile",
  cron: "*/5 * * * *",
  async handler(services) {
    for (const guild of services.client.guilds.cache.values()) {
      if (!services.modules.isEnabled(guild.id, ModuleName)) continue;
      const release = await services.helpers.cache
        .takeLock(`${ModuleName}:reconcile:${guild.id}`, 120_000)
        .catch(() => null);
      if (!release) continue;
      try {
        await reconcileGuild(services, guild.id);
      } catch (error) {
        services.observability.logger.warn(
          "multi-lounge reconcile failed",
          { guildId: guild.id, error },
        );
      } finally {
        await release().catch(() => undefined);
      }
    }
  },
};

const multiLoungeModule: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Multi Lounge",
  emoji: "🛋️",
  description:
    "Auto-scaling voice lounges that clone a base channel when its group fills up and clean up empty extras.",
  version: "2.0.0",
  config: ConfigSchema,
  commands: [loungeCommand],
  listeners: [voiceStateListener],
  tasks: [reconcileTask],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default multiLoungeModule;