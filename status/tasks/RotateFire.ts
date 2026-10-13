import { ActivityType } from "discord.js";
import type { Container } from "@lumi-devs/lumi/services";
import type { OneshotContext } from "@lumi-devs/lumi/scheduler";
import { scheduleOneshot } from "@lumi-devs/lumi/scheduler";
import {
  MODULE_NAME,
  ROTATE_ONESHOT,
  type StatusEntry,
} from "../utilities/Keys.js";
import {
  getEntries,
  getState,
  saveState,
} from "../utilities/Data.js";
import {
  isDue,
  nextFromQueue,
  resolvePlaceholders,
} from "../utilities/Rotation.js";

const ACTIVITY_TYPES: Record<StatusEntry["type"], ActivityType> = {
  Playing: ActivityType.Playing,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Custom: ActivityType.Custom,
  Competing: ActivityType.Competing,
};

export async function convergeGuild(
  services: Container,
  guildId: string,
  now: number = Date.now(),
): Promise<StatusEntry | null> {
  const lock = await services.valkey
    .set(`lumi:status:presence-lock:${guildId}`, "1", "PX", 65_000, "NX")
    .catch(() => null);
  if (lock !== "OK") return null;
  const [entries, state] = await Promise.all([
    getEntries(services, guildId),
    getState(services, guildId, now),
  ]);
  if (!isDue(state, now) || entries.length === 0) return null;

  const step = nextFromQueue(
    state.queue,
    entries.map((e) => e.id),
    state.lastId,
  );
  const entry = entries.find((e) => e.id === step.next);
  if (!entry) return null;

  const guildsCount = services.client.guilds.cache.size;
  const usersCount = services.client.guilds.cache.reduce(
    (acc, g) => acc + (g.memberCount ?? 0),
    0,
  );
  const text = resolvePlaceholders(entry.text, {
    guilds: guildsCount,
    users: usersCount,
  });

  services.client.user?.setPresence({
    status: entry.presence,
    activities: [{ name: text, type: ACTIVITY_TYPES[entry.type] }],
  });

  await saveState(services, guildId, {
    ...state,
    queue: step.queue,
    lastId: entry.id,
    nextAtMs: now + state.intervalMs,
  });
  return entry;
}

export async function ensureScheduled(
  services: Container,
  guildId: string,
  now: number = Date.now(),
): Promise<void> {
  const [entries, state] = await Promise.all([
    getEntries(services, guildId),
    getState(services, guildId, now),
  ]);
  if (!state.enabled || entries.length === 0) return;
  if (state.scheduledForMs === state.nextAtMs && state.nextAtMs > now) return;

  const delay = Math.max(0, state.nextAtMs - now);
  await scheduleOneshot(
    services,
    MODULE_NAME,
    ROTATE_ONESHOT,
    guildId,
    delay,
    { guildId },
  );
  await saveState(services, guildId, { ...state, scheduledForMs: state.nextAtMs });
}

export async function nudgeGuild(
  services: Container,
  guildId: string,
  now: number = Date.now(),
): Promise<StatusEntry | null> {
  const applied = await convergeGuild(services, guildId, now);
  await ensureScheduled(services, guildId, now);
  return applied;
}

export async function handleRotateFire(
  services: Container,
  ctx: OneshotContext,
): Promise<void> {
  const payload = ctx.data as { guildId?: string } | null;
  const guildId = ctx.guildId || payload?.guildId;
  if (!guildId) return;
  await nudgeGuild(services, guildId).catch((error: unknown) =>
    services.logger.error(
      `[status] rotation failed: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
}
