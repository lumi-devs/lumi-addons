import { defineModule } from "@lumi-devs/lumi/module";
import { cfg } from "@lumi-devs/lumi/config";
import { oneshots } from "./tasks/CleanupFire.js";

export const threadCleanerModule = defineModule({
  name: "thread-cleaner",
  displayName: "Thread Cleaner",
  emoji: "🧹",
  description: "Automatically archives or locks threads after a configurable period of inactivity.",
  short: "Auto-archive/lock inactive threads.",
  endUserDataStatement: "Does not collect or store personal end-user data. Stores thread IDs and cleanup metadata.",
  version: "1.0.0",
  disableable: true,
  dependencies: [],
  conflicts: [],
  configOverrides: true,
  category: "Utility",
  author: ["Lumi Developers"],
  min_bot_version: "0.6.0",
  configSchema: cfg.object({
    enabled_channels: cfg.multiChannel({
      label: "Enabled Channels",
      description: "Channels where new threads should be scheduled for cleanup.",
      default: [],
    }),
    inactive_duration: cfg.duration({
      label: "Inactivity Duration",
      description: "Duration of inactivity before cleanup runs (e.g. 24h, 3d).",
      default: "3d",
      quickPicks: ["1h", "6h", "24h", "3d", "7d"],
    }),
    action: cfg.enum(["archive", "lock"] as const, {
      label: "Cleanup Action",
      description: "Action to perform on inactive threads.",
      default: "archive",
    }),
  }),
});

export { oneshots };
