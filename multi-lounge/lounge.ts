import type { ModuleServices } from "@lumi/module-kit";
import {
  ChannelType,
  type Guild,
  type GuildMember,
  type OverwriteData,
  type VoiceChannel,
  type VoiceState,
} from "discord.js";
import {
  allBusy,
  claimCreationCooldown,
  type Config,
  type ExtraLounge,
  getConfig,
  listGroups,
  loungeName,
  type ManagedGroup,
  nextFreeNumber,
  readGroup,
  recordCreation,
  recordDeletion,
  recordPeak,
  releaseCreationCooldown,
  removeGroup,
  writeGroup,
} from "./data.js";

export interface ExtraOccupancy {
  channelId: string;
  number: number;
  count: number;
}

export interface BaseOccupancy {
  baseId: string;
  baseExists: boolean;
  baseCount: number;
  extras: ExtraOccupancy[];
}

const tails = new Map<string, Promise<unknown>>();

function serialize<T>(guildId: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(guildId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(work);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(guildId, tail);
  void tail.then(() => {
    if (tails.get(guildId) === tail) tails.delete(guildId);
  });
  return run;
}

async function resolveGuild(
  services: ModuleServices,
  guildId: string,
): Promise<Guild | null> {
  return (
    services.client.guilds.cache.get(guildId) ??
    (await services.client.guilds.fetch(guildId).catch(() => null))
  );
}

async function resolveVoiceChannel(
  guild: Guild,
  channelId: string,
): Promise<VoiceChannel | null> {
  const cached = guild.channels.cache.get(channelId);
  const channel =
    cached ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;
  return channel;
}

function overwriteSnapshots(base: VoiceChannel): OverwriteData[] {
  return base.permissionOverwrites.cache.map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));
}

async function createLounge(
  guild: Guild,
  base: VoiceChannel,
  number: number,
  template: string,
): Promise<ExtraLounge | null> {
  const overwrites = overwriteSnapshots(base);
  const created = await guild.channels
    .create({
      name: loungeName(template, number).slice(0, 100),
      type: ChannelType.GuildVoice,
      ...(base.parentId ? { parent: base.parentId } : {}),
      bitrate: base.bitrate,
      userLimit: base.userLimit,
      ...(base.rtcRegion ? { rtcRegion: base.rtcRegion } : {}),
      ...(overwrites.length > 0
        ? { permissionOverwrites: overwrites }
        : {}),
      reason: "Multi Lounge: auto-scaled lounge",
    })
    .catch(() => null);
  if (!created) return null;
  return { channelId: created.id, number };
}

async function deleteEmptyExtra(
  services: ModuleServices,
  guild: Guild,
  baseId: string,
  extras: ExtraLounge[],
  channelId: string,
): Promise<ExtraLounge[]> {
  const channel = await resolveVoiceChannel(guild, channelId);
  if (channel) {
    if (channel.members.size > 0) return extras;
    const deleted = await channel
      .delete("Multi Lounge: empty lounge")
      .then(() => true)
      .catch(() => false);
    if (!deleted) return extras;
  }

  const remaining = extras.filter((extra) => extra.channelId !== channelId);
  await writeGroup(services, guild.id, { baseId, extras: remaining });
  await recordDeletion(services, guild.id);
  return remaining;
}

async function pruneExtras(
  services: ModuleServices,
  guild: Guild,
  group: ManagedGroup,
  removeEmpty: boolean,
): Promise<ExtraLounge[]> {
  let extras: ExtraLounge[] = [];
  let changed = false;

  for (const extra of group.extras) {
    const channel = await resolveVoiceChannel(guild, extra.channelId);
    if (!channel) {
      changed = true;
      await recordDeletion(services, guild.id);
      continue;
    }
    if (removeEmpty && channel.members.size === 0) {
      const deleted = await channel
        .delete("Multi Lounge: empty lounge")
        .then(() => true)
        .catch(() => false);
      if (deleted) {
        changed = true;
        await recordDeletion(services, guild.id);
        continue;
      }
    }
    extras = [...extras, extra];
  }

  if (changed) {
    await writeGroup(services, guild.id, {
      baseId: group.baseId,
      extras,
    });
  }
  return extras;
}

async function deleteAllExtras(
  services: ModuleServices,
  guild: Guild,
  extras: readonly ExtraLounge[],
): Promise<void> {
  for (const extra of extras) {
    const channel = await resolveVoiceChannel(guild, extra.channelId);
    if (channel) {
      await channel
        .delete("Multi Lounge: base channel removed")
        .catch(() => undefined);
    }
    await recordDeletion(services, guild.id);
  }
}

async function findBaseForExtra(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<string | null> {
  const groups = await listGroups(services, guildId);
  for (const group of groups) {
    if (group.extras.some((extra) => extra.channelId === channelId)) {
      return group.baseId;
    }
  }
  return null;
}

async function groupSlotCounts(
  guild: Guild,
  base: VoiceChannel,
  extras: readonly ExtraLounge[],
): Promise<number[]> {
  const counts = [base.members.size];
  for (const extra of extras) {
    const channel = await resolveVoiceChannel(guild, extra.channelId);
    counts.push(channel?.members.size ?? 0);
  }
  return counts;
}

async function updatePeak(
  services: ModuleServices,
  guild: Guild,
  config: Config,
): Promise<void> {
  let total = 0;
  for (const baseId of config.baseChannelIds) {
    const base = await resolveVoiceChannel(guild, baseId);
    if (!base) continue;
    total += base.members.size;
    const group = await readGroup(services, guild.id, baseId);
    for (const extra of group.extras) {
      const channel = await resolveVoiceChannel(guild, extra.channelId);
      total += channel?.members.size ?? 0;
    }
  }
  await recordPeak(services, guild.id, total);
}

async function handleDeparture(
  services: ModuleServices,
  guild: Guild,
  config: Config,
  channelId: string,
): Promise<void> {
  if (config.baseChannelIds.includes(channelId)) return;
  const baseId = await findBaseForExtra(services, guild.id, channelId);
  if (!baseId || !config.baseChannelIds.includes(baseId)) return;
  const group = await readGroup(services, guild.id, baseId);
  await deleteEmptyExtra(
    services,
    guild,
    baseId,
    group.extras,
    channelId,
  );
}

async function handleArrival(
  services: ModuleServices,
  guild: Guild,
  config: Config,
  channelId: string,
  member: GuildMember | null,
): Promise<void> {
  const baseId = config.baseChannelIds.includes(channelId)
    ? channelId
    : await findBaseForExtra(services, guild.id, channelId);
  if (!baseId || !config.baseChannelIds.includes(baseId)) return;

  const base = await resolveVoiceChannel(guild, baseId);
  if (!base) {
    const group = await readGroup(services, guild.id, baseId);
    await deleteAllExtras(services, guild, group.extras);
    await removeGroup(services, guild.id, baseId);
    return;
  }

  const group = await readGroup(services, guild.id, baseId);
  const extras = await pruneExtras(services, guild, group, false);
  if (extras.length >= config.maxExtras) return;

  const counts = await groupSlotCounts(guild, base, extras);
  if (!allBusy(counts, config.busyThreshold)) return;

  const number = nextFreeNumber(extras.map((extra) => extra.number));
  const claimed = await claimCreationCooldown(
    services,
    guild.id,
    baseId,
    config.creationCooldownSeconds,
  );
  if (!claimed) return;

  const created = await createLounge(
    guild,
    base,
    number,
    config.nameTemplate,
  );
  if (!created) {
    await releaseCreationCooldown(services, guild.id, baseId);
    return;
  }

  await writeGroup(services, guild.id, {
    baseId,
    extras: [...extras, created],
  });
  await recordCreation(services, guild.id);

  if (channelId === baseId && member?.voice.channelId === baseId) {
    await member.voice
      .setChannel(created.channelId, "Multi Lounge: opening a new lounge")
      .catch(() => undefined);
  }
}

export async function handleVoiceState(
  services: ModuleServices,
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guildId = newState.guild?.id ?? oldState.guild?.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (!guildId || oldChannelId === newChannelId) return;

  await serialize(guildId, async () => {
    const config = await getConfig(services, guildId);
    if (config.baseChannelIds.length === 0) return;
    const guild = await resolveGuild(services, guildId);
    if (!guild) return;

    if (oldChannelId) {
      await handleDeparture(services, guild, config, oldChannelId);
    }
    if (newChannelId) {
      await handleArrival(
        services,
        guild,
        config,
        newChannelId,
        newState.member,
      );
      await updatePeak(services, guild, config);
    }
  });
}

export async function reconcileGuild(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  return serialize(guildId, async () => {
    const config = await getConfig(services, guildId);
    if (config.baseChannelIds.length === 0) return 0;
    const guild = await resolveGuild(services, guildId);
    if (!guild) return 0;

    const configured = new Set(config.baseChannelIds);
    const groups = await listGroups(services, guildId);
    for (const group of groups) {
      if (!configured.has(group.baseId)) {
        await deleteAllExtras(services, guild, group.extras);
        await removeGroup(services, guildId, group.baseId);
      }
    }

    let totalExtras = 0;
    for (const baseId of configured) {
      const base = await resolveVoiceChannel(guild, baseId);
      if (!base) {
        const group = await readGroup(services, guildId, baseId);
        await deleteAllExtras(services, guild, group.extras);
        await removeGroup(services, guildId, baseId);
        continue;
      }
      const group = await readGroup(services, guildId, baseId);
      const extras = await pruneExtras(services, guild, group, true);
      totalExtras += extras.length;
    }

    await updatePeak(services, guild, config);
    return totalExtras;
  });
}

export async function collectOccupancy(
  services: ModuleServices,
  guildId: string,
  baseIds: readonly string[],
): Promise<BaseOccupancy[]> {
  const guild = await resolveGuild(services, guildId);
  if (!guild) {
    return baseIds.map((baseId) => ({
      baseId,
      baseExists: false,
      baseCount: 0,
      extras: [],
    }));
  }

  const groups = await listGroups(services, guildId);
  const byBase = new Map(groups.map((group) => [group.baseId, group]));

  const result: BaseOccupancy[] = [];
  for (const baseId of baseIds) {
    const base = await resolveVoiceChannel(guild, baseId);
    const extras = [...(byBase.get(baseId)?.extras ?? [])].sort(
      (a, b) => a.number - b.number,
    );
    const entries = await Promise.all(
      extras.map(async (extra) => {
        const channel = await resolveVoiceChannel(guild, extra.channelId);
        return {
          channelId: extra.channelId,
          number: extra.number,
          count: channel?.members.size ?? 0,
        };
      }),
    );
    result.push({
      baseId,
      baseExists: base !== null,
      baseCount: base?.members.size ?? 0,
      extras: entries,
    });
  }
  return result;
}