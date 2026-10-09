import { guilds } from "lumi/discord";
import type { BoosterConfig } from "./config.js";
import { isBlacklisted } from "./data.js";
import { isBoosterEligible } from "./engine.js";

export function isEligible(
  roles: string[],
  premiumSince: number | null,
  config: BoosterConfig,
): boolean {
  return isBoosterEligible(roles, premiumSince, config.boosterRoleIds);
}

export async function accessDenial(
  guildId: string,
  userId: string,
  config: BoosterConfig,
): Promise<string | null> {
  if (await isBlacklisted(guildId, userId)) {
    return "You're blacklisted from using custom roles here.";
  }
  const member = await guilds.fetchMember(guildId, userId);
  if (!member || !isEligible(member.roles, member.premiumSince, config)) {
    return "You need to be a server booster to use custom roles.";
  }
  return null;
}
