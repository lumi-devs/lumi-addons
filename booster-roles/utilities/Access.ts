import type { Container } from "@lumi-devs/lumi/services";
import type { BoosterConfig } from "./Config.js";
import { isBlacklisted } from "./Data.js";
import { isBoosterEligible } from "./Engine.js";

export function isEligible(
  roles: string[],
  premiumSince: number | null,
  config: BoosterConfig,
): boolean {
  return isBoosterEligible(roles, premiumSince, config.boosterRoleIds);
}

export async function accessDenial(
  services: Container,
  guildId: string,
  userId: string,
  config: BoosterConfig,
): Promise<string | null> {
  if (await isBlacklisted(services, guildId, userId)) {
    return "You're blacklisted from using custom roles here.";
  }
  const guild =
    services.client.guilds.cache.get(guildId) ??
    (await services.client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return "Could not resolve server.";
  }
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return "You need to be a server booster to use custom roles.";
  }
  const roleIds = member.roles.cache.map((r) => r.id);
  const premiumSince = member.premiumSinceTimestamp;
  if (!isEligible(roleIds, premiumSince, config)) {
    return "You need to be a server booster to use custom roles.";
  }
  return null;
}
