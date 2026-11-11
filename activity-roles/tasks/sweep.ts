import type {
  ModuleServices,
  TaskDefinition,
} from "@lumi/module-kit";
import type { Guild } from "discord.js";
import {
  clearGranted,
  listGrantedTargets,
  listRules,
  ModuleName,
} from "../data.js";
import { activitiesFromPresence } from "../logic.js";
import { reconcileMember } from "../runtime.js";

const SweepLockTtlMs = 9 * 60_000;

export interface SweepResult {
  checked: number;
  changed: number;
}

export async function sweepGuild(
  services: ModuleServices,
  guild: Guild,
): Promise<SweepResult> {
  if (!services.modules.isEnabled(guild.id, ModuleName)) {
    return { checked: 0, changed: 0 };
  }
  const lockKey = `activity-roles:sweep:${guild.id}`;
  const acquired = await services.helpers.cache
    .setNx(lockKey, "1", SweepLockTtlMs)
    .catch(() => false);
  if (!acquired) return { checked: 0, changed: 0 };

  const [rules, grantedTargets] = await Promise.all([
    listRules(services, guild.id),
    listGrantedTargets(services, guild.id),
  ]);
  if (rules.length === 0 && grantedTargets.length === 0) {
    return { checked: 0, changed: 0 };
  }

  const members = await guild.members
    .fetch({ withPresences: true })
    .catch(() => null);
  if (!members) return { checked: 0, changed: 0 };

  const granted = new Set(grantedTargets);
  let checked = 0;
  let changed = 0;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    const presence = member.presence;
    if (!presence && !granted.has(member.id)) continue;
    checked++;
    try {
      const outcome = await reconcileMember(
        services,
        guild,
        member,
        presence ? activitiesFromPresence(presence) : [],
      );
      if (outcome.added.length > 0 || outcome.removed.length > 0) changed++;
    } catch (error) {
      services.observability.logger.warn("activity role sweep member failed", {
        guildId: guild.id,
        userId: member.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const userId of granted) {
    if (members.has(userId)) continue;
    await clearGranted(services, guild.id, userId).catch(() => 0);
  }

  return { checked, changed };
}

export const sweepTask: TaskDefinition = {
  name: "sweep",
  cron: "*/10 * * * *",
  async handler(services: ModuleServices): Promise<void> {
    for (const guild of services.client.guilds.cache.values()) {
      try {
        await sweepGuild(services, guild);
      } catch (error) {
        services.observability.logger.warn("activity role sweep failed", {
          guildId: guild.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
};
