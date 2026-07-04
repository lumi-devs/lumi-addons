import { container } from "@sapphire/framework";
import { ActivityType, type GuildMember } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { parseConfigList } from "#core/module-system/Module.js";
import { acquireRedisLock } from "#core/lib/redis-lock.js";
import {
  makeSuccessCard,
  makeWarningCard,
  noPingCard,
} from "#utilities/cards.js";
import {
  MODULE_NAME,
  PromoterData,
  PromoterKeys,
  type PromoterStats,
} from "../keys.js";
import { statusMatches } from "./matching.js";

export interface PromoterConfig {
  roleId: string | null;
  logChannelId: string | null;
  matchTerms: string[];
  sweepIntervalMinutes: number;
}

export async function getPromoterConfig(
  guildId: string,
): Promise<PromoterConfig> {
  const get = (key: string) =>
    container.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [role, log, terms, sweep] = await Promise.all([
    get("promoter_role_id"),
    get("log_channel_id"),
    get("match_terms"),
    get("sweep_interval_minutes"),
  ]);
  return {
    roleId: (role as string | null) ?? null,
    logChannelId: (log as string | null) ?? null,
    matchTerms: parseConfigList(terms),
    sweepIntervalMinutes: (sweep as number | null) ?? 30,
  };
}

export async function getStats(guildId: string): Promise<PromoterStats> {
  return (
    (await container.db.guildKV.getModuleData<PromoterStats>(
      guildId,
      MODULE_NAME,
      PromoterData.META,
      PromoterData.STATS,
    )) ?? { granted: 0, revoked: 0 }
  );
}

export async function bumpStats(
  guildId: string,
  field: keyof PromoterStats,
): Promise<void> {
  const release = await acquireRedisLock(
    container.redis,
    PromoterKeys.statsLock(guildId),
    { ttlMs: 5_000, acquireTimeoutMs: 10_000 },
  );
  try {
    const stats = await getStats(guildId);
    stats[field] += 1;
    await container.db.guildKV.setModuleData(
      guildId,
      MODULE_NAME,
      PromoterData.META,
      PromoterData.STATS,
      stats,
    );
  } finally {
    await release();
  }
}

function customStatusText(member: GuildMember): string {
  const activity = member.presence?.activities.find(
    (a) => a.type === ActivityType.Custom,
  );
  return activity?.state ?? "";
}

async function log(
  guildId: string,
  logChannelId: string | null,
  card: ReturnType<typeof makeSuccessCard>,
): Promise<void> {
  if (!logChannelId) return;
  const channel = container.client.guilds.cache
    .get(guildId)
    ?.channels.cache.get(logChannelId);
  if (channel?.isTextBased()) await channel.send(card).catch(() => null);
}

export type EvaluateResult =
  | "granted"
  | "revoked"
  | "unchanged"
  | "unconfigured";

/**
 * Grant or revoke the promoter role based on the member's current custom
 * status. Offline members are never *revoked* just for being unreadable —
 * only a member whose presence we can actually read loses the role.
 */
export async function evaluateMember(
  member: GuildMember,
): Promise<EvaluateResult> {
  if (member.user.bot) return "unchanged";
  const cfg = await getPromoterConfig(member.guild.id);
  if (!cfg.roleId || cfg.matchTerms.length === 0) return "unconfigured";
  const role = member.guild.roles.cache.get(cfg.roleId);
  if (!role) return "unconfigured";

  const hasRole = member.roles.cache.has(role.id);
  const status = customStatusText(member);
  const matches = statusMatches(status, cfg.matchTerms);

  if (matches && !hasRole) {
    await member.roles.add(role, "Promoter: server advertised in status");
    await bumpStats(member.guild.id, "granted");
    await log(
      member.guild.id,
      cfg.logChannelId,
      noPingCard(
        makeSuccessCard(
          "Promoter Role Granted",
          `${userMention(member.id)} is advertising the server.\n> ${cutText(status, 100)}`,
        ),
      ),
    );
    return "granted";
  }

  if (!matches && hasRole && member.presence) {
    await member.roles.remove(role, "Promoter: status no longer advertises");
    await bumpStats(member.guild.id, "revoked");
    await log(
      member.guild.id,
      cfg.logChannelId,
      noPingCard(
        makeWarningCard(
          "Promoter Role Removed",
          `${userMention(member.id)} stopped advertising the server.`,
        ),
      ),
    );
    return "revoked";
  }

  return "unchanged";
}
