import { container } from "@sapphire/framework";
import { isModuleEnabled } from "lumi/permissions";
import { MODULE_NAME, PromoterKeys } from "../keys.js";
import { evaluateMember, getPromoterConfig } from "./evaluate.js";

/**
 * Worker-side handler for the periodic self-heal sweep. Broadcast, so each
 * worker sweeps its own `guilds.cache`.
 *
 * Only walks `guild.members.cache`, not a bulk `members.fetch()`: a member
 * currently holding the promoter role is guaranteed to already be cached
 * (they were resolved via presence/interaction at grant time), so revokes are
 * always caught. A member who has never been observed by this process (no
 * presence, no interaction) won't be discovered for a *new* grant until
 * something else caches them - that's the tradeoff for not issuing a bulk
 * member fetch (and its rate-limit / privileged-intent cost) on every tick.
 */
export async function handlePromoterSweepFire(): Promise<void> {
  const { client, redis, logger } = container;
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    try {
      if (!(await isModuleEnabled(guild.id, MODULE_NAME))) continue;

      const cfg = await getPromoterConfig(guild.id);
      const hasSignal = cfg.matchTerms.length > 0 || cfg.detectServerTag;
      if (!cfg.roleId || !hasSignal) continue;

      const key = PromoterKeys.lastSweep(guild.id);
      const lastRaw = await redis.get(key);
      const last = lastRaw ? Number(lastRaw) : 0;
      const intervalMs = cfg.sweepIntervalMinutes * 60_000;
      if (now - last < intervalMs) continue;

      for (const member of guild.members.cache.values()) {
        await evaluateMember(member).catch((err) => {
          logger.warn(
            `[Promoter] sweep evaluate failed for ${member.id} in ${guild.id}:`,
            err,
          );
        });
      }

      await redis.set(key, now.toString());
    } catch (err) {
      logger.warn(`[Promoter] sweep failed for ${guild.id}:`, err);
    }
  }
}
