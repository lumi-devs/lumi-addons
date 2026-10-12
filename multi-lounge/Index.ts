import { ChannelType } from "discord.js";
import { defineModule } from "@lumi-devs/lumi/lib/module-system/Module.js";
import { cfg } from "@lumi-devs/lumi/lib/module-system/ConfigSchema.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { MODULE_NAME } from "./utilities/Keys.js";
import { oneshots as reconcileOneshots } from "./tasks/ReconcileFire.js";

export const multiLoungeModule = defineModule({
  name: MODULE_NAME,
  displayName: "Multi Lounge",
  emoji: "🛋️",
  version: "1.0.0",
  description:
    "Dynamic voice lounges: creates temporary child voice channels on demand and removes them when empty.",
  short: "Dynamic voice lounges that scale with demand.",
  endUserDataStatement:
    "Does not store any personal end-user data. Manages dynamic voice channels based on guild member occupancy without persisting user identities.",
  author: ["Antigravity"],
  min_bot_version: "0.6.0",
  category: "Voice",
  disableable: true,
  configSchema: cfg.object({
    base_channel_ids: cfg.multiChannel({
      label: "Base Lounges",
      description:
        "Parent voice channels that trigger temporary lounge creation.",
      channelTypes: [ChannelType.GuildVoice],
    }),
    busy_threshold: cfg.number({
      label: "Busy Threshold",
      description: "Users in a lounge before it counts as busy.",
      default: 2,
      min: 1,
      max: 99,
    }),
    max_extra_lounges: cfg.number({
      label: "Max Extra Lounges",
      description: "Maximum temporary lounges per base.",
      default: 5,
      min: 1,
      max: 25,
    }),
    name_template: cfg.string({
      label: "Name Template",
      description: "Name for created lounges; {n} is the lounge number.",
      default: "Lounge {n}",
    }),
    cooldown_seconds: cfg.number({
      label: "Creation Cooldown (seconds)",
      description: "Minimum gap between creating lounges.",
      default: 10,
      min: 0,
      max: 300,
    }),
  }),

  async deleteUserData(services: Container, userId: string): Promise<void> {
    await services.db.guildKV.deleteModuleDataForTarget(MODULE_NAME, userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await services.db.guildKV.listModuleDataForTarget(
      MODULE_NAME,
      userId,
    );
    if (rows.length === 0) return null;
    return { data: rows.map((r) => r.value) };
  },
});

export const oneshots = reconcileOneshots;

export default multiLoungeModule;
