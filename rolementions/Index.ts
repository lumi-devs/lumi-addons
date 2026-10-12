import { defineModule } from "@lumi-devs/lumi/module";
import { cfg } from "@lumi-devs/lumi/config";
import type { Container } from "@lumi-devs/lumi/services";
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
    return { mentions: rows.map((r) => r.value) };
  },
});

export const oneshots = {
  expire: handleExpire,
};

export default rolementionsModule;
