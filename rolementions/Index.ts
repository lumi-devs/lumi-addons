import { defineModule } from "@lumi-devs/lumi/module";
import { cfg } from "@lumi-devs/lumi/config";
import { moduleGdpr } from "@lumi-devs/lumi/gdpr";
import { handleExpire } from "./tasks/ExpireFire.js";
import { MODULE_NAME } from "./utilities/Keys.js";

export const rolementionsModule = defineModule({
  name: MODULE_NAME,
  displayName: "Role Mentions",
  emoji: "🛡️",
  version: "1.0.0",
  description:
    "Tracks role mentions with daily stats and auto-protects sensitive roles from mention spam via timed mention blocks.",
  short: "Role-mention tracking + auto-protection.",
  endUserDataStatement:
    "Tracks role mention counts and cooldown timestamps in guild storage. Does not store personal end-user data or message contents.",
  author: ["Antigravity"],
  min_bot_version: "0.6.0",
  category: "Moderation",
  disableable: true,
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description:
        "Channel where mention activity and protection events are logged.",
    }),
    auto_protect: cfg.boolean({
      label: "Auto-Protect",
      description:
        "Automatically block mentions of protected roles when they are pinged.",
      default: true,
    }),
  }),

  ...moduleGdpr(MODULE_NAME, "mentions"),
});

export const oneshots = {
  expire: handleExpire,
};

export default rolementionsModule;
