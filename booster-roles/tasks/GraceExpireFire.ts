import type { Container } from "#src/lib/Services.js";
import type { OneshotContext } from "#src/lib/scheduler/Oneshot.js";
import { getBoosterConfig } from "../utilities/Config.js";
import {
  clearGrace,
  deleteBoosterRole,
  getGrace,
  getRole,
} from "../utilities/Data.js";
import { isEligible } from "../utilities/Access.js";

interface GraceExpireData {
  guildId?: string;
  ownerId?: string;
  expiresAt?: number;
}

export async function handleGraceExpire(
  services: Container,
  ctx: OneshotContext,
): Promise<void> {
  const payload = (ctx.data ?? {}) as GraceExpireData;
  const guildId = payload.guildId ?? ctx.guildId;
  const ownerId = payload.ownerId;
  const scheduledExpiresAt = payload.expiresAt;

  if (!ownerId) return;

  const grace = await getGrace(services, guildId, ownerId);
  if (!grace) return;
  if (scheduledExpiresAt && grace.expiresAt > scheduledExpiresAt) return;

  const role = await getRole(services, guildId, ownerId);
  if (!role) {
    await clearGrace(services, guildId, ownerId);
    return;
  }

  const config = await getBoosterConfig(services, guildId);
  const guild =
    services.client.guilds.cache.get(guildId) ??
    (await services.client.guilds.fetch(guildId).catch(() => null));
  const member = guild ? await guild.members.fetch(ownerId).catch(() => null) : null;

  if (member) {
    const roleIds = member.roles.cache.map((r) => r.id);
    const premiumSince = member.premiumSinceTimestamp;
    if (isEligible(roleIds, premiumSince, config)) {
      await clearGrace(services, guildId, ownerId);
      return;
    }
  }

  await deleteBoosterRole(
    services,
    guildId,
    role,
    config,
    "boost lapsed grace period expired",
  );
}
