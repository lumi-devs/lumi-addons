import type { GuildMember } from "discord.js";
import type { BoosterConfig } from "./config.js";
import { isBlacklisted } from "./data.js";
import { isEligible } from "./roles.js";

/**
 * Gate for member-facing actions. Returns a user-facing reason string when the
 * member may not use custom roles, or `null` when they're allowed.
 */
export async function accessDenial(
  member: GuildMember,
  config: BoosterConfig,
): Promise<string | null> {
  if (await isBlacklisted(member.guild.id, member.id))
    return "You're blacklisted from using custom roles here.";
  if (!isEligible(member, config))
    return "You need to be a server booster to use custom roles.";
  return null;
}
