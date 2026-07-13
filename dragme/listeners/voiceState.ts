import { ApplyOptions } from "@sapphire/decorators";
import type { VoiceState } from "discord.js";
import { ModuleListener } from "#core/module-system/ModuleListener.js";
import { MODULE_NAME, DragmeKeys } from "../keys.js";
import { getDragmeConfig } from "../lib/config.js";

@ApplyOptions<ModuleListener.Options>({
  event: "voiceStateUpdate",
  module: MODULE_NAME,
})
export class DragmeVoiceStateListener extends ModuleListener<"voiceStateUpdate"> {
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
    if (!oldState.channelId || oldState.channelId === newState.channelId)
      return;

    const guildId = oldState.guild.id;
    const userId = oldState.member?.id;
    if (!userId) return;

    const cfg = await getDragmeConfig(guildId);
    if (!cfg.grantHiddenPerms) return;

    const key = DragmeKeys.tempPerm(guildId, oldState.channelId, userId);
    const exists = await this.container.redis.exists(key);
    if (exists) {
      await this.container.redis.del(key);
      const { channel } = oldState;
      if (channel) {
        await channel.permissionOverwrites
          .delete(
            userId,
            "Dragme: temporary permission revoked on channel leave",
          )
          .catch(() => null);
        this.container.logger.info(
          `[Dragme] Revoked temporary permission for ${userId} in hidden channel ${channel.id} because they left.`,
        );
      }
    }
  }
}
