import { defineModule } from "@lumi-devs/lumi/module";
import type { Container } from "@lumi-devs/lumi/services";
import { moduleGdpr } from "@lumi-devs/lumi/gdpr";
import { SWEEP_ONESHOT } from "./utilities/Store.js";
import {
  ensureScheduled,
  handleSweepFire,
  sweepGuild,
} from "./tasks/Sweep.js";

export const activityRolesModule = defineModule({
  name: "activity-roles",
  displayName: "Activity Roles",
  emoji: "🎮",
  description:
    "Auto-assign roles based on users' Discord presence (Playing, Streaming, Listening, Watching, Custom, Competing).",
  short: "Presence-based role automation.",
  endUserDataStatement:
    "Stores each member's recent activity snapshot and the role IDs this addon granted, keyed by user ID in guild storage, to assign and revoke activity roles. Removed when the member's data is purged.",
  category: "Automation",

  onLoad(services: Container) {
    for (const guild of services.client.guilds.cache.values()) {
      void sweepGuild(services, guild.id).catch(() => undefined);
      void ensureScheduled(services, guild.id).catch(() => undefined);
    }
  },

  async reconcileScheduledJobs(services: Container) {
    for (const guild of services.client.guilds.cache.values()) {
      if (!(await services.db.modules.isModuleEnabled(guild.id, "activity-roles"))) continue;
      await sweepGuild(services, guild.id).catch(() => undefined);
      void ensureScheduled(services, guild.id).catch(() => undefined);
    }
  },

  ...moduleGdpr("activity-roles", "memberStates"),
});

export const oneshots = {
  [SWEEP_ONESHOT]: handleSweepFire,
};
