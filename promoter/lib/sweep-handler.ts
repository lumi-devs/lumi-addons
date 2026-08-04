import { container } from "@sapphire/framework";
import { isModuleEnabled } from "lumi/permissions";
import { MODULE_NAME, PromoterKeys } from "../keys.js";
import { evaluateMember, getPromoterConfig } from "./evaluate.js";

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
