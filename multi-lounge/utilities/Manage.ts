import { ChannelType, type VoiceChannel } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { scheduleOneshot } from "#src/lib/scheduler/Oneshot.js";
import {
  RECONCILE_INTERVAL_MS,
  RECONCILE_TASK,
  MODULE_NAME,
  type ExtraLounge,
} from "./Keys.js";
import { getLoungeConfig, type LoungeConfig } from "./Config.js";
import {
  canCreateChild,
  loungeName,
  nextFreeNumber,
  shouldDeleteChild,
} from "./Engine.js";
import {
  getExtras,
  isCoolingDown,
  listRegisteredBases,
  markCooldown,
  recordCreation,
  recordDeletion,
  recordPeak,
  setExtras,
} from "./Data.js";

const tails = new Map<string, Promise<void>>();

function serialized<T>(guildId: string, work: () => Promise<T>): Promise<T> {
  if (tails.size > 200) tails.clear();
  const tail = tails.get(guildId) ?? Promise.resolve();
  const next = tail.catch(() => null).then(work);
  tails.set(
    guildId,
    next.then(
      () => {
        tails.delete(guildId);
      },
      () => {
        tails.delete(guildId);
      },
    ),
  );
  return next;
}

export async function countOccupants(
  services: Container,
  guildId: string,
  channelId: string,
): Promise<number> {
  try {
    const guild = services.client.guilds.cache.get(guildId) ??
      (await services.client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return 0;
    const channel = guild.channels.cache.get(channelId) ??
      (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isVoiceBased()) return 0;
    return channel.members.size;
  } catch {
    return 0;
  }
}

async function updatePeakStats(
  services: Container,
  guildId: string,
  config: LoungeConfig,
): Promise<void> {
  let total = 0;
  for (const baseId of config.baseChannelIds) {
    total += await countOccupants(services, guildId, baseId);
    const extras = await getExtras(services, guildId, baseId);
    for (const extra of extras) {
      total += await countOccupants(services, guildId, extra.channelId);
    }
  }
  await recordPeak(services, guildId, total);
}

export async function handleVoiceState(
  services: Container,
  guildId: string,
  userId: string,
  oldChannelId: string | null,
  newChannelId: string | null,
): Promise<void> {
  await serialized(guildId, async () => {
    const config = await getLoungeConfig(services, guildId);

    if (newChannelId && config.baseChannelIds.includes(newChannelId)) {
      const cooldownActive = isCoolingDown(
        guildId,
        newChannelId,
        config.cooldownSeconds,
      );
      const extras = await getExtras(services, guildId, newChannelId);

      if (canCreateChild(extras.length, config.maxExtras, cooldownActive)) {
        const nextNum = nextFreeNumber(extras.map((e) => e.number));
        const name = loungeName(config.nameTemplate, nextNum);
        const guild = services.client.guilds.cache.get(guildId) ??
          (await services.client.guilds.fetch(guildId).catch(() => null));
        if (guild) {
          const baseChannel = guild.channels.cache.get(newChannelId) ??
            (await guild.channels.fetch(newChannelId).catch(() => null));
          const voiceBase = baseChannel && baseChannel.isVoiceBased()
            ? (baseChannel as VoiceChannel)
            : null;

          const created = await guild.channels
            .create({
              name,
              type: ChannelType.GuildVoice,
              ...(voiceBase?.parentId ? { parent: voiceBase.parentId } : {}),
              ...(voiceBase?.userLimit ? { userLimit: voiceBase.userLimit } : {}),
              ...(voiceBase?.bitrate ? { bitrate: voiceBase.bitrate } : {}),
              reason: "multi-lounge dynamic channel",
            })
            .catch(() => null);

          if (created) {
            const member = guild.members.cache.get(userId) ??
              (await guild.members.fetch(userId).catch(() => null));
            if (member?.voice.channelId === newChannelId) {
              await member.voice.setChannel(created).catch(() => null);
            }
            const updated: ExtraLounge[] = [
              ...extras,
              { channelId: created.id, baseId: newChannelId, number: nextNum },
            ];
            await setExtras(services, guildId, newChannelId, updated);
            markCooldown(guildId, newChannelId, config.cooldownSeconds);
            await recordCreation(services, guildId);
            await scheduleOneshot(
              services,
              MODULE_NAME,
              RECONCILE_TASK,
              guildId,
              RECONCILE_INTERVAL_MS,
              { guildId },
            ).catch(() => null);
          }
        }
      }
    }

    if (oldChannelId) {
      const bases = await listRegisteredBases(services, guildId);
      for (const baseId of bases) {
        const extras = await getExtras(services, guildId, baseId);
        const match = extras.find((e) => e.channelId === oldChannelId);
        if (match) {
          const occupants = await countOccupants(services, guildId, oldChannelId);
          if (shouldDeleteChild(occupants)) {
            const guild = services.client.guilds.cache.get(guildId) ??
              (await services.client.guilds.fetch(guildId).catch(() => null));
            const channel = guild?.channels.cache.get(oldChannelId) ??
              (await guild?.channels.fetch(oldChannelId).catch(() => null));
            await channel?.delete("multi-lounge empty").catch(() => null);
            await setExtras(
              services,
              guildId,
              baseId,
              extras.filter((e) => e.channelId !== oldChannelId),
            );
            await recordDeletion(services, guildId);
          }
          break;
        }
      }
    }

    await updatePeakStats(services, guildId, config);
  });
}

export async function reconcileGuild(
  services: Container,
  guildId: string,
): Promise<number> {
  return serialized(guildId, async () => {
    const config = await getLoungeConfig(services, guildId);
    const configured = new Set(config.baseChannelIds);
    const bases = await listRegisteredBases(services, guildId);
    let totalExtras = 0;

    const guild = services.client.guilds.cache.get(guildId) ??
      (await services.client.guilds.fetch(guildId).catch(() => null));

    for (const baseId of bases) {
      const extras = await getExtras(services, guildId, baseId);
      const remaining: ExtraLounge[] = [];

      for (const extra of extras) {
        let occupants = 0;
        let channelExists = false;
        if (guild) {
          const channel = guild.channels.cache.get(extra.channelId) ??
            (await guild.channels.fetch(extra.channelId).catch(() => null));
          if (channel && channel.isVoiceBased()) {
            channelExists = true;
            occupants = channel.members.size;
          }
        }

        if (!channelExists || occupants === 0) {
          if (channelExists && guild) {
            const ch = guild.channels.cache.get(extra.channelId);
            await ch?.delete("multi-lounge empty").catch(() => null);
          }
          await recordDeletion(services, guildId);
        } else {
          remaining.push(extra);
        }
      }

      if (remaining.length !== extras.length || !configured.has(baseId)) {
        await setExtras(
          services,
          guildId,
          baseId,
          configured.has(baseId) ? remaining : [],
        );
      }
      if (configured.has(baseId)) {
        totalExtras += remaining.length;
      }
    }

    await updatePeakStats(services, guildId, config);
    return totalExtras;
  });
}
