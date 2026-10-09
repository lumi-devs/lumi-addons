import { cfg, defineModule } from "lumi";
import { registerTaskFireHandler } from "lumi/scheduling";
import { EXPIRE_TASK } from "./keys.js";
import { handleDragmeExpireFire } from "./lib/expire-handler.js";

export const meta = defineModule({
  name: "dragme",
  displayName: "Drag Me",
  emoji: "🫳",
  version: "1.0.0",
  description:
    "Voice drag requests approved by the people already in the channel.",
  short: "Ask to be dragged into a voice channel.",
  endUserDataStatement:
    "Temporarily stores voice drag request metadata (requesting user ID, target channel ID, timestamp) until the request is completed, rejected, or expires.",
  configSchema: cfg.object({
    request_channel_id: cfg.channel({
      label: "Request Channel",
      description: "Text channel where drag request cards are posted.",
      // 0 = GuildText; avoids importing discord.js for one enum value.
      channelTypes: [0],
    }),
    timeout_minutes: cfg.number({
      label: "Request Timeout (minutes)",
      description: "Minutes before an unanswered request expires.",
      default: 5,
      min: 1,
      max: 60,
    }),
    blacklist_role_ids: cfg.multiRole({
      label: "Blacklisted Roles",
      description: "Roles that may not use drag requests.",
    }),
  }),
});

registerTaskFireHandler(EXPIRE_TASK, handleDragmeExpireFire);
