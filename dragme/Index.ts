import { defineModule } from "@lumi-devs/lumi/module";
import { cfg } from "@lumi-devs/lumi/config";
import { moduleGdpr } from "@lumi-devs/lumi/gdpr";
import type { Container } from "@lumi-devs/lumi/services";
import { ChannelType } from "discord.js";
import { handleExpire } from "./tasks/ExpireFire.js";
import { MODULE_NAME } from "./utilities/Keys.js";
import type { OneshotContext } from "@lumi-devs/lumi/scheduler";

export const dragmeModule = defineModule({
  name: MODULE_NAME,
  displayName: "Drag Me",
  emoji: "🫳",
  version: "1.0.0",
  description:
    "Voice drag requests: ask to be pulled into a voice channel and let the people inside approve with one click. Accepting moves you straight in.",
  short: "Ask to be dragged into a voice channel.",
  endUserDataStatement:
    "Temporarily stores voice drag request metadata (requesting user ID, target channel ID, timestamp) until the request is completed, rejected, or expires.",
  author: ["Antigravity"],
  min_bot_version: "0.6.0",
  category: "Community",
  configSchema: cfg.object({
    request_channel_id: cfg.channel({
      label: "Request Channel",
      description: "Text channel where drag request cards are posted.",
      channelTypes: [ChannelType.GuildText],
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

  ...moduleGdpr(MODULE_NAME, "dragRequests"),
});

export const oneshots: Record<string, (services: Container, ctx: OneshotContext) => Promise<void>> = {
  expire: handleExpire,
};
