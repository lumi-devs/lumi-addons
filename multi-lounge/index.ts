import { cfg, defineModule, logger, toStringArray } from "lumi";
import { getModuleConfig } from "lumi/config";
import { onEvent } from "lumi/events";
import { registerTaskFireHandler } from "lumi/scheduling";
import { RECONCILE_TASK } from "./keys.js";
import { handleVoiceState } from "./lib/manage.js";
import { handleLoungeReconcileFire } from "./lib/reconcile-handler.js";

export const meta = defineModule({
  name: "multi-lounge",
  displayName: "Multi Lounge",
  emoji: "🛋️",
  version: "1.0.0",
  description:
    "Dynamic voice lounges — creates temporary child voice channels when a base channel is joined and cleans them up when empty.",
  configSchema: cfg.object({
    base_channel_ids: cfg.multiChannel({
      label: "Base Lounges",
      description:
        "Parent voice channels that trigger temporary lounge creation.",
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
});

onEvent("voiceStateUpdate", async (data) => {
  const guildId = data["guildId"] as string;
  const userId = data["userId"] as string;
  const oldChannelId = (data["oldChannelId"] as string | null) ?? null;
  const newChannelId = (data["newChannelId"] as string | null) ?? null;
  if (!guildId || oldChannelId === newChannelId) return;

  const bases = toStringArray(
    await getModuleConfig("base_channel_ids", guildId),
  );
  if (bases.length === 0 && !oldChannelId) return;

  await handleVoiceState(guildId, userId, oldChannelId, newChannelId).catch(
    (err: unknown) =>
      logger.warn(
        `[multi-lounge] voiceStateUpdate failed for ${guildId}: ${String(err)}`,
      ),
  );
});

registerTaskFireHandler(RECONCILE_TASK, handleLoungeReconcileFire);
