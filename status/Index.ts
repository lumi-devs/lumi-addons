import { defineModule } from "@lumi-devs/lumi/module";
import type { Container } from "@lumi-devs/lumi/services";
import { handleRotateFire, ensureScheduled } from "./tasks/RotateFire.js";
import {
  MODULE_NAME,
  ROTATE_ONESHOT,
  StatusStore,
  type StatusEntry,
} from "./utilities/Keys.js";
import { saveEntries } from "./utilities/Data.js";

export const statusModule = defineModule({
  name: MODULE_NAME,
  displayName: "Status Rotator",
  emoji: "🔁",
  version: "1.0.0",
  description:
    "Rotating bot presence managed at runtime by the bot owner: custom statuses with activity type, online status, and live placeholders.",
  short: "Owner-managed rotating presence.",
  endUserDataStatement:
    "Stores rotating bot status entries configured by bot owners, scoped per server. Records the owner user ID who created each status entry for audit purposes.",
  category: "Utility",
  disableable: true,
  author: ["Antigravity"],
  min_bot_version: "0.6.0",

  onLoad(services: Container) {
    for (const guild of services.client.guilds.cache.values()) {
      void ensureScheduled(services, guild.id).catch(() => undefined);
    }
  },

  async reconcileScheduledJobs(services: Container) {
    for (const guild of services.client.guilds.cache.values()) {
      void ensureScheduled(services, guild.id).catch(() => undefined);
    }
  },

  async deleteUserData(services: Container, userId: string): Promise<void> {
    const rows = await services.db.guildKV.listModuleData<StatusEntry[]>({
      module: MODULE_NAME,
      key: StatusStore.entries,
    });
    for (const row of rows) {
      const entries = row.value ?? [];
      const remaining = entries.filter((e) => e.addedBy !== userId);
      if (remaining.length !== entries.length) {
        await saveEntries(services, row.guildId, remaining);
      }
    }
    await services.db.guildKV.deleteModuleDataForTarget(MODULE_NAME, userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await services.db.guildKV.listModuleData<StatusEntry[]>({
      module: MODULE_NAME,
      key: StatusStore.entries,
    });
    const userEntries = rows.flatMap((r) =>
      (r.value ?? [])
        .filter((e) => e.addedBy === userId)
        .map((e) => ({ guildId: r.guildId, ...e })),
    );
    if (userEntries.length === 0) return null;
    return { entries: userEntries };
  },
});

export const oneshots = {
  [ROTATE_ONESHOT]: handleRotateFire,
};

export default statusModule;
