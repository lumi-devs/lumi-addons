import { logger } from "lumi";
import { clientStats, presence } from "lumi/discord";
import { schedule } from "lumi/scheduling";
import type { StatusEntry } from "../keys.js";
import { getEntries, getState, saveState } from "./data.js";
import { isDue, nextFromQueue, resolvePlaceholders } from "./rotation.js";

const ACTIVITY_TYPES: Record<StatusEntry["type"], number> = {
  Playing: 0,
  Listening: 2,
  Watching: 3,
  Custom: 4,
  Competing: 5,
};

export async function convergeGuild(
  guildId: string,
  now: number = Date.now(),
): Promise<StatusEntry | null> {
  const [entries, state] = await Promise.all([
    getEntries(guildId),
    getState(guildId, now),
  ]);
  if (!isDue(state, now) || entries.length === 0) return null;

  const step = nextFromQueue(
    state.queue,
    entries.map((e) => e.id),
    state.lastId,
  );
  const entry = entries.find((e) => e.id === step.next);
  if (!entry) return null;

  const stats = await clientStats().catch(() => null);
  const text = resolvePlaceholders(entry.text, {
    guilds: stats?.guilds ?? 0,
    users: stats?.users ?? 0,
  });

  await presence.set({
    status: entry.presence,
    activities: [{ name: text, type: ACTIVITY_TYPES[entry.type] }],
  });
  await saveState(guildId, {
    ...state,
    queue: step.queue,
    lastId: entry.id,
    nextAtMs: now + state.intervalMs,
  });
  return entry;
}

export async function ensureScheduled(
  guildId: string,
  now: number = Date.now(),
): Promise<void> {
  const [entries, state] = await Promise.all([
    getEntries(guildId),
    getState(guildId, now),
  ]);
  if (!state.enabled || entries.length === 0) return;
  if (state.scheduledForMs === state.nextAtMs && state.nextAtMs > now) return;
  await schedule(
    "status:rotate",
    { guildId },
    { delay: Math.max(0, state.nextAtMs - now) },
  );
  await saveState(guildId, { ...state, scheduledForMs: state.nextAtMs });
}

export async function nudgeGuild(
  guildId: string,
  now: number = Date.now(),
): Promise<StatusEntry | null> {
  const applied = await convergeGuild(guildId, now);
  await ensureScheduled(guildId, now);
  return applied;
}

export async function handleStatusRotateFire(
  payload: Record<string, unknown>,
): Promise<void> {
  const guildId = payload["guildId"];
  if (typeof guildId !== "string" || guildId.length === 0) return;
  await nudgeGuild(guildId).catch((error: unknown) =>
    logger.error(
      `[status] rotation failed: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
}
