import { Events, type VoiceState } from "discord.js";
import { defineListener, addListenerDef } from "@lumi-devs/lumi/lib/listeners/ListenerDef.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { MODULE_NAME } from "../utilities/Keys.js";
import { getLoungeConfig } from "../utilities/Config.js";
import { handleVoiceState } from "../utilities/Manage.js";

export const voiceStateUpdateListener = defineListener({
  name: "multiLoungeVoiceStateUpdate",
  event: Events.VoiceStateUpdate,
  module: MODULE_NAME,
  guildId: (oldState: VoiceState, newState: VoiceState) =>
    newState.guild?.id ?? oldState.guild?.id ?? null,
  async execute(
    services: Container,
    oldState: VoiceState,
    newState: VoiceState,
  ): Promise<void> {
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    const userId = newState.member?.id ?? oldState.member?.id;
    const oldChannelId = oldState.channelId ?? null;
    const newChannelId = newState.channelId ?? null;

    if (!guildId || !userId || oldChannelId === newChannelId) return;

    const config = await getLoungeConfig(services, guildId);
    if (config.baseChannelIds.length === 0 && !oldChannelId) return;

    await handleVoiceState(
      services,
      guildId,
      userId,
      oldChannelId,
      newChannelId,
    ).catch((err: unknown) => {
      services.logger.warn(
        `[multi-lounge] voiceStateUpdate failed for ${guildId}: ${String(err)}`,
      );
    });
  },
});

addListenerDef(voiceStateUpdateListener);

export default voiceStateUpdateListener;
