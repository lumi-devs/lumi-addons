import { container } from "@sapphire/framework";
import { AsyncQueue } from "@sapphire/async-queue";
import {
  ChannelType,
  type Guild,
  type VoiceChannel,
  type OverwriteResolvable,
} from "discord.js";
import { LoungeKeys, type ExtraLounge } from "../keys.js";
import { getLoungeConfig, type LoungeConfig } from "./config.js";
import { evaluateLounges, loungeName, type LoungeSlot } from "./engine.js";
import {
  getExtras,
  setExtras,
  listRegisteredBases,
  recordCreation,
  recordDeletion,
  recordPeak,
} from "./data.js";

// Per-guild serialization so overlapping voice events can't double-create or
// double-delete. In-process is correct on the monolith; the reconcile task
// heals any drift on split deployments.
const queues = new Map<string, AsyncQueue>();
const queueFor = (guildId: string): AsyncQueue => {
  let q = queues.get(guildId);
  if (!q) queues.set(guildId, (q = new AsyncQueue()));
  return q;
};

function asVoice(channel: unknown): VoiceChannel | null {
  return channel &&
    typeof channel === "object" &&
    (channel as { type?: number }).type === ChannelType.GuildVoice
    ? (channel as VoiceChannel)
    : null;
}

/** Build one base's slot view (base + live extras), pruning dead registry rows. */
function buildSlots(
  guild: Guild,
  base: VoiceChannel,
  extras: ExtraLounge[],
): { slots: LoungeSlot[]; live: ExtraLounge[] } {
  const slots: LoungeSlot[] = [
    { channelId: base.id, number: 0, count: base.members.size, isBase: true },
  ];
  const live: ExtraLounge[] = [];
  for (const extra of extras) {
    const channel = asVoice(guild.channels.cache.get(extra.channelId));
    if (!channel) continue; // deleted out-of-band — drop it
    live.push(extra);
    slots.push({
      channelId: channel.id,
      number: extra.number,
      count: channel.members.size,
      isBase: false,
    });
  }
  return { slots, live };
}

async function createExtra(
  guild: Guild,
  base: VoiceChannel,
  baseId: string,
  number: number,
  config: LoungeConfig,
  extras: ExtraLounge[],
): Promise<void> {
  const overwrites: OverwriteResolvable[] = base.permissionOverwrites.cache.map(
    (o) => ({ id: o.id, type: o.type, allow: o.allow, deny: o.deny }),
  );
  const created = await guild.channels.create({
    name: loungeName(config.nameTemplate, number),
    type: ChannelType.GuildVoice,
    parent: base.parent ?? undefined,
    bitrate: base.bitrate,
    userLimit: base.userLimit,
    position: base.position + 1,
    permissionOverwrites: overwrites,
    reason: "multi-lounge: all lounges busy",
  });
  await setExtras(guild.id, baseId, [
    ...extras,
    { channelId: created.id, number },
  ]);
  await recordCreation(guild.id);
  if (config.cooldownSeconds > 0)
    await container.redis.set(
      LoungeKeys.cooldown(guild.id, baseId),
      "1",
      "EX",
      config.cooldownSeconds,
    );
}

async function deleteExtra(
  guild: Guild,
  baseId: string,
  channelId: string,
  extras: ExtraLounge[],
): Promise<void> {
  const channel = asVoice(guild.channels.cache.get(channelId));
  if (channel && channel.members.size === 0)
    await channel.delete("multi-lounge: extra lounge empty").catch(() => null);
  await setExtras(
    guild.id,
    baseId,
    extras.filter((e) => e.channelId !== channelId),
  );
  await recordDeletion(guild.id);
}

/** Manage one base group; returns its total occupancy for peak tracking. */
async function manageBase(
  guild: Guild,
  baseId: string,
  config: LoungeConfig,
): Promise<number> {
  const base = asVoice(guild.channels.cache.get(baseId));
  if (!base) return 0; // base missing/not voice — nothing to manage

  const stored = await getExtras(guild.id, baseId);
  const { slots, live } = buildSlots(guild, base, stored);
  if (live.length !== stored.length) await setExtras(guild.id, baseId, live);

  const cooldownActive =
    (await container.redis.exists(LoungeKeys.cooldown(guild.id, baseId))) === 1;
  const action = evaluateLounges(slots, config, cooldownActive);

  if (action.kind === "create")
    await createExtra(guild, base, baseId, action.number, config, live);
  else if (action.kind === "delete")
    await deleteExtra(guild, baseId, action.channelId, live);

  return slots.reduce((sum, s) => sum + s.count, 0);
}

/** Remove registry rows (and their empty channels) for de-configured bases. */
async function cleanupStaleBases(
  guild: Guild,
  configuredBases: Set<string>,
): Promise<void> {
  for (const baseId of await listRegisteredBases(guild.id)) {
    if (configuredBases.has(baseId)) continue;
    for (const extra of await getExtras(guild.id, baseId)) {
      const channel = asVoice(guild.channels.cache.get(extra.channelId));
      if (channel && channel.members.size === 0)
        await channel
          .delete("multi-lounge: base no longer managed")
          .catch(() => null);
    }
    await setExtras(guild.id, baseId, []);
  }
}

/**
 * Evaluate every configured base in a guild and apply at most one action each.
 * Serialized per guild; safe to call from the voice listener and the reconcile
 * sweep.
 */
export async function manageLounges(guild: Guild): Promise<void> {
  const queue = queueFor(guild.id);
  await queue.wait();
  try {
    const config = await getLoungeConfig(guild.id);
    const bases = new Set(config.baseChannelIds);
    await cleanupStaleBases(guild, bases);
    if (bases.size === 0) return;

    let totalUsers = 0;
    for (const baseId of bases) {
      totalUsers += await manageBase(guild, baseId, config);
    }
    await recordPeak(guild.id, totalUsers);
  } catch (err) {
    container.logger.warn(`[multi-lounge] manage failed for ${guild.id}:`, err);
  } finally {
    queue.shift();
  }
}
