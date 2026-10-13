import type { Container } from "@lumi-devs/lumi/services";
import type { OneshotContext } from "@lumi-devs/lumi/scheduler";
import { scheduleOneshot } from "@lumi-devs/lumi/scheduler";
import {
  MODULE_NAME,
  SWEEP_ONESHOT,
  getMappings,
} from "../utilities/Store.js";
import { converge } from "../utilities/Engine.js";
import type { PresenceActivity } from "../utilities/Matcher.js";

const INITIAL_DELAY_MS = 90_000;
const SWEEP_INTERVAL_MS = 3_600_000;

const scheduled = new Set<string>();

export async function sweepGuild(
  services: Container,
  guildId: string,
): Promise<{ checked: number; changed: number }> {
  const empty = { checked: 0, changed: 0 };
  const guild = services.client.guilds.cache.get(guildId);
  if (!guild) return empty;
  if (!(await services.db.modules.isModuleEnabled(guildId, MODULE_NAME)))
    return empty;
  const mappings = await getMappings(services, guildId);
  if (mappings.length === 0) return empty;
  const members = await guild.members.fetch({ withPresences: true }).catch(() => null);
  if (!members) return empty;
  let checked = 0;
  let changed = 0;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    checked++;
    const presence = member.presence;
    if (!presence) continue;
    const activities: PresenceActivity[] = presence.activities.map((a) => ({
      name: a.name,
      type: a.type,
      state: a.state,
      details: a.details,
    }));
    const outcome = await converge(services, { guild, member, activities }).catch(() => null);
    if (outcome && outcome.result !== "holding" && outcome.result !== "not-holding") changed++;
  }
  return { checked, changed };
}

export async function ensureScheduled(
  services: Container,
  guildId: string,
): Promise<void> {
  if (scheduled.has(guildId)) return;
  scheduled.add(guildId);
  await scheduleOneshot(services, MODULE_NAME, SWEEP_ONESHOT, guildId, INITIAL_DELAY_MS, {
    guildId,
  });
}

export async function handleSweepFire(
  services: Container,
  ctx: OneshotContext,
): Promise<void> {
  const payload = ctx.data as { guildId?: string } | null;
  const guildId = ctx.guildId || payload?.guildId;
  if (!guildId) return;
  await sweepGuild(services, guildId).catch((error: unknown) =>
    services.logger.error(
      `[ActivityRoles] sweep failed: ${error instanceof Error ? error.message : String(error)}`,
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
