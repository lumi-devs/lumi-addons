import type { ModuleServices } from "@lumi/module-kit";
import { cardCreateOptions, type CardReply } from "@lumi/ui";
import {
  ActivityType,
  PermissionFlagsBits,
  type GuildMember,
  type Presence,
  type Role,
} from "discord.js";
import {
  ModuleName,
  bumpStats,
  clearGranted,
  describeSignals,
  getConfig,
  getGranted,
  setGranted,
  statusMatches,
  wearsServerTag,
  type PromoterConfig,
} from "./data.js";
import { logGrantCard, logRevokeCard } from "./ui.js";

export type ConvergeResult =
  | "granted"
  | "revoked"
  | "holding"
  | "not-holding"
  | "unreadable"
  | "unmanaged"
  | "not-manageable"
  | "unconfigured";

export interface SweepSummary {
  checked: number;
  changed: number;
}

export function customStatusText(
  presence: Presence | null | undefined,
): string | null {
  if (!presence || presence.status === "offline") return null;
  const custom = presence.activities.find(
    (activity) => activity.type === ActivityType.Custom,
  );
  return custom?.state ?? "";
}

function manageableRole(member: GuildMember, roleId: string): Role | null {
  const role = member.guild.roles.cache.get(roleId);
  if (!role || role.managed) return null;
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return null;
  if (me.roles.highest.position <= role.position) return null;
  return role;
}

async function postLog(
  services: ModuleServices,
  guildId: string,
  config: PromoterConfig,
  card: CardReply,
): Promise<void> {
  if (!config.logChannelId) return;
  try {
    const channel = await services.client.channels.fetch(config.logChannelId);
    if (!channel?.isSendable()) return;
    await channel.send(cardCreateOptions(card));
  } catch (error) {
    services.observability.logger.warn("promoter log post failed", {
      guildId,
      error,
    });
  }
}

async function note(
  services: ModuleServices,
  guildId: string,
  field: "grants" | "revokes",
): Promise<void> {
  try {
    await bumpStats(services, guildId, field);
  } catch (error) {
    services.observability.logger.warn("promoter stats update failed", {
      guildId,
      error,
    });
  }
}

export async function converge(
  services: ModuleServices,
  input: {
    guildId: string;
    member: GuildMember;
    statusText: string | null;
    worn: boolean;
  },
): Promise<ConvergeResult> {
  const { guildId, member } = input;
  if (member.user.bot) return "not-holding";

  const config = await getConfig(services, guildId);
  const roleId = config.promoterRoleId;
  if (!roleId) return "unconfigured";

  const terms = config.matchTerms
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  const statusEnabled = terms.length > 0;
  const tagEnabled = config.detectServerTag;
  if (!statusEnabled && !tagEnabled) return "unconfigured";

  const statusMatched =
    statusEnabled &&
    input.statusText !== null &&
    statusMatches(input.statusText, terms);
  const tagMatched = tagEnabled && input.worn;
  const desired = statusMatched || tagMatched;
  const tagOnly = tagEnabled && !statusEnabled;
  const canConcludeAbsent = input.statusText !== null || tagOnly;
  const granted = await getGranted(services, guildId, member.id);

  if (!desired && !canConcludeAbsent) return "unreadable";

  const hasRole = member.roles.cache.has(roleId);
  if (desired) {
    const reason = describeSignals(statusMatched, tagMatched);
    if (hasRole) {
      if (!granted) return "unmanaged";
      if (granted.reason !== reason) {
        await setGranted(services, guildId, member.id, {
          grantedAt: granted.grantedAt,
          reason,
        });
      }
      return "holding";
    }

    if (!manageableRole(member, roleId)) return "not-manageable";
    await setGranted(services, guildId, member.id, {
      grantedAt: new Date().toISOString(),
      reason,
    });
    try {
      await member.roles.add(roleId, `Promoter: ${reason}`);
    } catch (error) {
      await clearGranted(services, guildId, member.id).catch(() => {
        return;
      });
      services.observability.logger.warn("promoter role add failed", {
        guildId,
        userId: member.id,
        error,
      });
      return "not-manageable";
    }
    await note(services, guildId, "grants");
    await postLog(
      services,
      guildId,
      config,
      logGrantCard(
        member.id,
        reason,
        member.displayAvatarURL({ size: 256 }),
      ),
    );
    return "granted";
  }

  if (!granted) return "not-holding";

  if (hasRole) {
    if (!manageableRole(member, roleId)) return "not-manageable";
    try {
      await member.roles.remove(roleId, "Promoter: signal removed");
    } catch (error) {
      services.observability.logger.warn("promoter role remove failed", {
        guildId,
        userId: member.id,
        error,
      });
      return "not-manageable";
    }
  }

  await clearGranted(services, guildId, member.id);
  await note(services, guildId, "revokes");
  await postLog(
    services,
    guildId,
    config,
    logRevokeCard(
      member.id,
      granted.reason,
      member.displayAvatarURL({ size: 256 }),
    ),
  );
  return "revoked";
}

export async function sweepGuild(
  services: ModuleServices,
  guildId: string,
): Promise<SweepSummary> {
  const empty = { checked: 0, changed: 0 };
  const guild =
    services.client.guilds.cache.get(guildId) ??
    (await services.client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return empty;

  const config = await getConfig(services, guildId);
  const hasTerms = config.matchTerms.some(
    (term) => term.trim().length > 0,
  );
  if (
    !config.promoterRoleId ||
    (!hasTerms && !config.detectServerTag)
  ) {
    return empty;
  }

  const members = await guild.members
    .fetch({ withPresences: true })
    .catch(() => null);
  if (!members) return empty;

  let checked = 0;
  let changed = 0;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    checked += 1;
    try {
      const result = await converge(services, {
        guildId,
        member,
        statusText: customStatusText(member.presence),
        worn: wearsServerTag(member.user.primaryGuild, guildId),
      });
      if (result === "granted" || result === "revoked") changed += 1;
    } catch (error) {
      services.observability.logger.warn("promoter sweep member failed", {
        guildId,
        userId: member.id,
        error,
      });
    }
  }
  return { checked, changed };
}

async function sweepIfDue(
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const config = await getConfig(services, guildId);
  if (!config.promoterRoleId) return;

  const intervalMs = config.sweepIntervalMinutes * 60_000;
  const lastKey = `${ModuleName}:sweep:${guildId}`;
  const raw = await services.helpers.cache
    .getString(lastKey)
    .catch(() => null);
  const last = raw === null ? 0 : Number(raw);
  if (Number.isFinite(last) && Date.now() - last < intervalMs) return;

  await services.helpers.cache
    .setString(lastKey, String(Date.now()), Math.max(intervalMs * 2, 60_000))
    .catch(() => {
      return;
    });
  await sweepGuild(services, guildId);
}

export async function runSweepTask(services: ModuleServices): Promise<void> {
  for (const guild of services.client.guilds.cache.values()) {
    if (!services.modules.isEnabled(guild.id, ModuleName)) continue;
    try {
      await sweepIfDue(services, guild.id);
    } catch (error) {
      services.observability.logger.error("promoter sweep failed", {
        guildId: guild.id,
        error,
      });
    }
  }
}
