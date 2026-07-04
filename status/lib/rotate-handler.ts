import { container } from "@sapphire/framework";
import { ActivityType, type PresenceStatusData } from "discord.js";
import { StatusKeys, type StatusEntry } from "../keys.js";
import { getEntries, getSettings } from "./data.js";
import { nextFromQueue, resolvePlaceholders } from "./rotation.js";

const ACTIVITY_TYPES: Record<StatusEntry["type"], ActivityType> = {
  Custom: ActivityType.Custom,
  Playing: ActivityType.Playing,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing,
};

/**
 * Apply the next status in the rotation. Returns the applied entry, or null
 * when disabled / no entries / not yet due. `force` skips the due-check and
 * enabled-check (used by `/status preview`).
 *
 * Presence updates go over the gateway WS, so this only has an effect on the
 * process that owns the connection (monolith). See the addon README.
 */
export async function applyNextStatus(
  force = false,
): Promise<StatusEntry | null> {
  const { client, redis, logger } = container;
  const settings = await getSettings();

  if (!force) {
    if (!settings.enabled) return null;
    const rotatedAt = Number(
      (await redis.get(StatusKeys.lastRotatedAt())) ?? 0,
    );
    if (Date.now() - rotatedAt < settings.intervalMs) return null;
  }

  const entries = await getEntries();
  if (entries.length === 0 || !client.user) return null;

  const queue = (await redis.lrange(StatusKeys.queue(), 0, -1)).map(Number);
  const lastRaw = await redis.get(StatusKeys.last());
  const lastId = lastRaw === null ? null : Number(lastRaw);

  const allIds = entries.map((e) => e.id);
  const { next, queue: rest } = nextFromQueue(queue, allIds, lastId);
  const entry = entries.find((e) => e.id === next)!;

  const users = client.guilds.cache.reduce(
    (sum, g) => sum + (g.memberCount ?? 0),
    0,
  );
  const text = resolvePlaceholders(entry.text, {
    guilds: client.guilds.cache.size,
    users,
    shard: client.shard?.ids[0] ?? 0,
  });

  client.user.setPresence({
    status: entry.presence as PresenceStatusData,
    activities: [{ name: text, type: ACTIVITY_TYPES[entry.type] }],
  });

  const multi = redis
    .multi()
    .del(StatusKeys.queue())
    .set(StatusKeys.last(), String(entry.id))
    .set(StatusKeys.lastRotatedAt(), String(Date.now()));
  if (rest.length > 0) multi.rpush(StatusKeys.queue(), ...rest.map(String));
  await multi.exec();

  logger.debug(`[Status] Applied status #${entry.id}: ${text}`);
  return entry;
}

export async function handleStatusRotateFire(): Promise<void> {
  await applyNextStatus(false);
}
