import { ApplyOptions } from "@sapphire/decorators";
import type { VoiceState } from "discord.js";
import { ModuleListener } from "#core/module-system/ModuleListener.js";
import { MODULE_NAME } from "../keys.js";
import { getLoungeConfig } from "../lib/config.js";
import { manageLounges } from "../lib/manage.js";

// Coalesce bursts of voice events per guild into a single management pass. The
// AsyncQueue in manage.ts serializes the work; this just avoids re-evaluating
// on every individual join/leave in a churning category.
const DEBOUNCE_MS = 1500;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

@ApplyOptions<ModuleListener.Options>({
  event: "voiceStateUpdate",
  module: MODULE_NAME,
})
export class LoungeVoiceListener extends ModuleListener<"voiceStateUpdate"> {
  protected override resolveGuildId(
    oldState: VoiceState,
    newState: VoiceState,
  ): string | null {
    return newState.guild?.id ?? oldState.guild?.id ?? null;
  }

  protected async handle(
    oldState: VoiceState,
    newState: VoiceState,
  ): Promise<void> {
    // Ignore mute/deafen/stream noise — only channel moves matter.
    if (oldState.channelId === newState.channelId) return;

    const { guild } = newState;
    const config = await getLoungeConfig(guild.id);
    if (config.baseChannelIds.length === 0) return;

    // React only to events on a configured base or inside one of their
    // categories (registered extras share their base's category).
    const baseIds = new Set(config.baseChannelIds);
    const categoryIds = new Set(
      config.baseChannelIds
        .map((id) => guild.channels.cache.get(id)?.parentId)
        .filter((id): id is string => Boolean(id)),
    );
    const inScope = (channelId: string | null, parentId?: string | null) =>
      (channelId !== null && baseIds.has(channelId)) ||
      (Boolean(parentId) && categoryIds.has(parentId!));

    const touched =
      inScope(oldState.channelId, oldState.channel?.parentId) ||
      inScope(newState.channelId, newState.channel?.parentId);
    if (!touched) return;

    const existing = pending.get(guild.id);
    if (existing) clearTimeout(existing);
    pending.set(
      guild.id,
      setTimeout(() => {
        pending.delete(guild.id);
        void manageLounges(guild);
      }, DEBOUNCE_MS),
    );
  }
}
