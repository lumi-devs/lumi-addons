import { cfg, defineModule } from "lumi";
import { onEvent } from "lumi/events";
import { registerTaskFireHandler, schedule } from "lumi/scheduling";
import { get, set } from "lumi/kv";
import {
  converge,
  getPromoterConfig,
  statusTextOf,
  sweep,
} from "./lib/evaluate.js";
import { wearsServerTag } from "./lib/matching.js";
import { PromoterData } from "./keys.js";

export const meta = defineModule({
  name: "promoter",
  displayName: "Promoter",
  emoji: "📣",
  version: "1.0.0",
  description:
    "Auto-role for members advertising the server — in their custom status or by wearing the native server tag.",
  short: "Auto-role for members advertising the server.",
  endUserDataStatement:
    "Processes Discord user presence text in real-time to check for server promotions. Stores aggregated guild reward statistics; does not store personal user identifiers or profile data.",
  configSchema: cfg.object({
    promoter_role_id: cfg.role({
      label: "Promoter Role",
      description: "Role granted while a member advertises the server.",
    }),
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel for grant/revoke event cards.",
    }),
    match_terms: cfg.string({
      label: "Match Terms",
      description:
        'Comma-separated invite slugs / tags to look for in statuses, e.g. ".gg/lumi, LUMI". Leave empty to only use server-tag detection.',
    }),
    detect_server_tag: cfg.boolean({
      label: "Detect Server Tag",
      description:
        "Also grant the role to members wearing this server's native tag.",
      default: true,
    }),
    sweep_interval_minutes: cfg.number({
      label: "Sweep Interval (minutes)",
      description: "How often tag grants are re-verified per server.",
      default: 30,
      min: 5,
      max: 1440,
    }),
  }),
});

onEvent("presenceUpdate", async (data) => {
  const guildId = data.guildId as string;
  const userId = data.userId as string;
  const activities = (data.activities ?? []) as {
    name: string;
    type: number;
    state: string | null;
  }[];
  const roles = ((data.roles ?? []) as unknown[]).filter(
    (r): r is string => typeof r === "string",
  );
  await converge({
    guildId,
    userId,
    status: statusTextOf(activities),
    roles,
  }).catch(() => undefined);
});

onEvent("userUpdate", async (data) => {
  const primary = (data.primaryGuild ?? null) as {
    identityGuildId: string | null;
    identityEnabled: boolean | null;
  } | null;
  const guildId = primary?.identityGuildId;
  if (!guildId) return;
  const userId = data.userId as string;
  await converge({
    guildId,
    userId,
    worn: wearsServerTag(primary, guildId),
  }).catch(() => undefined);
  await ensureSweep(guildId).catch(() => undefined);
});

async function ensureSweep(guildId: string): Promise<void> {
  const cfg = await getPromoterConfig(guildId).catch(() => null);
  if (!cfg?.roleId) return;
  const at = await get<number>(guildId, PromoterData.META, "sweep-at").catch(
    () => null,
  );
  if (typeof at === "number" && Date.now() - at < cfg.sweepIntervalMinutes * 60_000) {
    return;
  }
  await set(guildId, PromoterData.META, "sweep-at", Date.now()).catch(() => undefined);
  await schedule(
    "promoter:sweep",
    { guildId },
    { delay: cfg.sweepIntervalMinutes * 60_000 },
  ).catch(() => undefined);
}

registerTaskFireHandler("promoter:sweep", async (payload) => {
  const guildId = payload.guildId as string | undefined;
  if (!guildId) return;
  await sweep(guildId).catch(() => undefined);
  const cfg = await getPromoterConfig(guildId).catch(() => null);
  if (!cfg?.roleId) return;
  await set(guildId, PromoterData.META, "sweep-at", Date.now()).catch(() => undefined);
  await schedule(
    "promoter:sweep",
    { guildId },
    { delay: cfg.sweepIntervalMinutes * 60_000 },
  ).catch(() => undefined);
});
