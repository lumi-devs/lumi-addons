import { defineModule } from "@lumi-devs/lumi/module";
import { cfg } from "@lumi-devs/lumi/config";
import { moduleGdpr } from "@lumi-devs/lumi/gdpr";
import type { Container } from "@lumi-devs/lumi/services";
import { scheduleOneshot, type OneshotContext } from "@lumi-devs/lumi/scheduler";
import { MODULE_NAME, SWEEP_ONESHOT, type MemberState } from "./utilities/Keys.js";
import { sweep } from "./utilities/Engine.js";

const INITIAL_DELAY_MS = 60_000;
const SWEEP_INTERVAL_MS = 300_000;

const scheduled = new Set<string>();

async function ensureScheduled(services: Container, guildId: string): Promise<void> {
  if (scheduled.has(guildId)) return;
  scheduled.add(guildId);
  await scheduleOneshot(services, MODULE_NAME, SWEEP_ONESHOT, guildId, INITIAL_DELAY_MS, {
    guildId,
  }).catch(() => undefined);
}

export async function handleSweepFire(
  services: Container,
  ctx: OneshotContext,
): Promise<void> {
  const payload = ctx.data as { guildId?: string } | null;
  const guildId = ctx.guildId || payload?.guildId;
  if (!guildId) return;
  await sweep(services, guildId).catch((error: unknown) =>
    services.logger.error(
      `[Promoter] sweep failed: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
  await scheduleOneshot(
    services,
    MODULE_NAME,
    SWEEP_ONESHOT,
    guildId,
    SWEEP_INTERVAL_MS,
    { guildId },
  ).catch(() => undefined);
}

export {
  getPromoterConfig,
  getStats,
  getMemberState,
  cutText,
  describeSource,
  converge,
  sweep,
  type PromoterConfig,
  type EvaluateResult,
} from "./utilities/Engine.js";
export { logGrant, logRevoke } from "./utilities/Cards.js";

export const promoterModule = defineModule({
  name: MODULE_NAME,
  displayName: "Promoter",
  emoji: "📣",
  description:
    "Rewards members who advertise the server in their custom status or server tag with a configurable role, removed automatically when the promotion stops. Includes thank-you and goodbye log cards.",
  short: "Auto-role for members advertising the server.",
  version: "1.0.0",
  endUserDataStatement:
    "Processes Discord user presence text in real-time to check for server promotions. Stores per-member cached state (status text, tag flag, role flag, promotion source) per guild; does not store personal profile data outside the bot instance.",
  category: "Community",
  configSchema: cfg.object({
    promoter_role_id: cfg.role({
      label: "Promoter Role",
      description: "Role granted to members advertising the server.",
      required: true,
    }),
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel for thank-you and goodbye log cards. Leave blank to disable.",
      required: false,
    }),
    match_terms: cfg.stringList({
      label: "Match Terms",
      description: "Phrases to look for in custom status (e.g. the server invite slug).",
      required: true,
    }),
    grant_message: cfg.string({
      label: "Grant Message",
      description: "Custom message quoted in the thank-you log card. Leave blank to skip.",
      required: false,
      default: "",
    }),
    detect_server_tag: cfg.boolean({
      label: "Detect Server Tag",
      description: "Also grant the role to members wearing the native server tag.",
      default: true,
    }),
  }),

  onLoad(services: Container) {
    for (const guild of services.client.guilds.cache.values()) {
      void sweep(services, guild.id).catch(() => undefined);
      void ensureScheduled(services, guild.id).catch(() => undefined);
    }
  },

  async reconcileScheduledJobs(services: Container) {
    for (const guild of services.client.guilds.cache.values()) {
      if (!(await services.db.modules.isModuleEnabled(guild.id, MODULE_NAME))) continue;
      await sweep(services, guild.id).catch(() => undefined);
      void ensureScheduled(services, guild.id).catch(() => undefined);
    }
  },

  ...moduleGdpr(MODULE_NAME, "states", (row) => ({ guildId: row.guildId, ...(row.value as MemberState) })),
});

export const oneshots = {
  [SWEEP_ONESHOT]: handleSweepFire,
};
