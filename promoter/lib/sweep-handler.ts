import { container } from "@sapphire/framework";
import { ActivityType } from "discord.js";
import { isModuleEnabled } from "#utilities/listeners.js";
import { MODULE_NAME, PromoterKeys } from "../keys.js";
import { evaluateMember, getPromoterConfig } from "./evaluate.js";
import { statusMatches } from "./matching.js";

/**
 * Broadcast sweep: every worker iterates its own guilds.cache. For each due,
 * enabled guild: re-check current role holders (drop stale) and cached online
 * members with a matching status (grant missed). Per-member failures are
 * logged and skipped so one bad member can't kill the sweep.
 */
export async function handlePromoterSweepFire(): Promise<void> {
  const { client, redis, logger } = container;

  for (const guild of client.guilds.cache.values()) {
    try {
      if (!(await isModuleEnabled(guild.id, MODULE_NAME))) continue;
      const cfg = await getPromoterConfig(guild.id);
      if (!cfg.roleId || cfg.matchTerms.length === 0) continue;

      const lastSweep = Number(
        (await redis.get(PromoterKeys.lastSweep(guild.id))) ?? 0,
      );
      if (Date.now() - lastSweep < cfg.sweepIntervalMinutes * 60_000) continue;
      await redis.set(PromoterKeys.lastSweep(guild.id), String(Date.now()));

      const role = guild.roles.cache.get(cfg.roleId);
      if (!role) continue;

      const candidates = new Map(role.members);
      for (const member of guild.members.cache.values()) {
        if (member.user.bot || candidates.has(member.id)) continue;
        const status = member.presence?.activities.find(
          (a) => a.type === ActivityType.Custom,
        )?.state;
        if (status && statusMatches(status, cfg.matchTerms)) {
          candidates.set(member.id, member);
        }
      }

      for (const member of candidates.values()) {
        await evaluateMember(member).catch((err) => {
          logger.warn(
            `[Promoter] sweep evaluate failed for ${member.id} in ${guild.id}:`,
            err,
          );
        });
      }
    } catch (err) {
      logger.warn(`[Promoter] sweep failed for guild ${guild.id}:`, err);
    }
  }
}
