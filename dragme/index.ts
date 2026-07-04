import { ChannelType } from "discord.js";
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handleDragmeExpireFire } from "./lib/expire-handler.js";
import { handleDragmeRevokeFire } from "./lib/revoke-handler.js";
import { deleteRequest } from "./lib/requests.js";

@DefineModule({
  name: "dragme",
  displayName: "Drag Me",
  emoji: "🫳",
  version: "1.0.0",
  description:
    "Voice drag requests approved by the people already in the channel.",
  configSchema: cfg.object({
    request_channel_id: cfg.channel({
      label: "Request Channel",
      description: "Text channel where drag requests are posted and triggered.",
      channelTypes: [ChannelType.GuildText],
    }),
    timeout_minutes: cfg.number({
      label: "Request Timeout (minutes)",
      description: "Minutes before an unanswered request expires.",
      default: 5,
      min: 1,
      max: 60,
    }),
    grace_minutes: cfg.number({
      label: "Connect Pass (minutes)",
      description:
        "How long an accepted requester who wasn't in voice keeps a temporary connect permission.",
      default: 10,
      min: 1,
      max: 120,
    }),
    blacklist_role_ids: cfg.string({
      label: "Blacklisted Roles",
      description: "Comma-separated role IDs that may not use drag requests.",
      list: true,
    }),
  }),
})
export class DragmeModule extends Module {
  public override onLoad() {
    registerTaskFireHandler("dragme-expire", "unicast", handleDragmeExpireFire);
    registerTaskFireHandler("dragme-revoke", "unicast", handleDragmeRevokeFire);
    return super.onLoad();
  }

  public override async deleteUserData(userId: string): Promise<void> {
    for (const guildId of this.container.client.guilds.cache.keys()) {
      await deleteRequest(guildId, userId);
    }
  }
}
