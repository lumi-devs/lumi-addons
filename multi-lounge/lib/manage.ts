import { channels, members, voiceChannels } from "lumi/discord";
import { schedule } from "lumi/scheduling";
import {
  RECONCILE_INTERVAL_MS,
  RECONCILE_TASK,
  type ExtraLounge,
} from "../keys.js";
import { getLoungeConfig, type LoungeConfig } from "./config.js";
import {
  canCreateChild,
  loungeName,
  nextFreeNumber,
  shouldDeleteChild,
} from "./engine.js";
import {
  getExtras,
  isCoolingDown,
  listRegisteredBases,
  markCooldown,
  recordCreation,
  recordDeletion,
  recordPeak,
  setExtras,
} from "./data.js";

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

async function countOccupants(channelId: string): Promise<number> {
  try {
    return (await voiceChannels.members(channelId)).length;
  } catch {
    return 0;
  }
}

async function updatePeakStats(
  guildId: string,
  config: LoungeConfig,
): Promise<void> {
  let total = 0;
  for (const baseId of config.baseChannelIds) {
    total += await countOccupants(baseId);
    const extras = await getExtras(guildId, baseId);
    for (const extra of extras) {
      total += await countOccupants(extra.channelId);
    }
  }
  await recordPeak(guildId, total);
}

export async function handleVoiceState(
  guildId: string,
  userId: string,
  oldChannelId: string | null,
  newChannelId: string | null,
): Promise<void> {
  await serialized(guildId, async () => {
    const config = await getLoungeConfig(guildId);

    if (newChannelId && config.baseChannelIds.includes(newChannelId)) {
      const cooldownActive = await isCoolingDown(
        guildId,
        newChannelId,
        config.cooldownSeconds,
      );
      const extras = await getExtras(guildId, newChannelId);

      if (canCreateChild(extras.length, config.maxExtras, cooldownActive)) {
        const nextNum = nextFreeNumber(extras.map((e) => e.number));
        const name = loungeName(config.nameTemplate, nextNum);
        const created = await channels
          .createVoice(guildId, name, {
            reason: "multi-lounge dynamic channel",
          })
          .catch(() => null);

        if (created) {
          await members.move(guildId, userId, created.id).catch(() => null);
          const updated: ExtraLounge[] = [
            ...extras,
            { channelId: created.id, baseId: newChannelId, number: nextNum },
          ];
          await setExtras(guildId, newChannelId, updated);
          await markCooldown(guildId, newChannelId, config.cooldownSeconds);
          await recordCreation(guildId);
          await schedule(
            RECONCILE_TASK,
            { guildId },
            { delay: RECONCILE_INTERVAL_MS },
          ).catch(() => null);
        }
      }
    }

    if (oldChannelId) {
      const bases = await listRegisteredBases(guildId);
      for (const baseId of bases) {
        const extras = await getExtras(guildId, baseId);
        const match = extras.find((e) => e.channelId === oldChannelId);
        if (match) {
          const occupants = await countOccupants(oldChannelId);
          if (shouldDeleteChild(occupants)) {
            await channels
              .remove(oldChannelId, "multi-lounge empty")
              .catch(() => null);
            await setExtras(
              guildId,
              baseId,
              extras.filter((e) => e.channelId !== oldChannelId),
            );
            await recordDeletion(guildId);
          }
          break;
        }
      }
    }

    await updatePeakStats(guildId, config);
  });
}

export async function reconcileGuild(guildId: string): Promise<number> {
  return serialized(guildId, async () => {
    const config = await getLoungeConfig(guildId);
    const configured = new Set(config.baseChannelIds);
    const bases = await listRegisteredBases(guildId);
    let totalExtras = 0;

    for (const baseId of bases) {
      const extras = await getExtras(guildId, baseId);
      const remaining: ExtraLounge[] = [];

      for (const extra of extras) {
        let occupants: string[];
        try {
          occupants = await voiceChannels.members(extra.channelId);
        } catch {
          continue;
        }

        if (occupants.length === 0) {
          await channels
            .remove(extra.channelId, "multi-lounge empty")
            .catch(() => null);
          await recordDeletion(guildId);
        } else {
          remaining.push(extra);
        }
      }

      if (remaining.length !== extras.length || !configured.has(baseId)) {
        await setExtras(
          guildId,
          baseId,
          configured.has(baseId) ? remaining : [],
        );
      }
      if (configured.has(baseId)) {
        totalExtras += remaining.length;
      }
    }

    await updatePeakStats(guildId, config);
    return totalExtras;
  });
}

export async function manageLounges(guildId: string): Promise<void> {
  await reconcileGuild(guildId);
}
