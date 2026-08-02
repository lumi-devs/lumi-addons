import { container } from "@sapphire/framework";
import { AsyncQueue } from "@sapphire/async-queue";
import type { Guild, GuildMember, Role } from "discord.js";
import type { CardReply } from "#utilities/cards.js";
import type { BoosterConfig } from "./config.js";

// Serialize role-position edits per guild — Discord renumbers every role on each
// positional write, so concurrent placements would fight over the hierarchy.
const positionQueues = new Map<string, AsyncQueue>();
const positionQueueFor = (guildId: string): AsyncQueue => {
  let q = positionQueues.get(guildId);
  if (!q) positionQueues.set(guildId, (q = new AsyncQueue()));
  return q;
};

/** Whether a member currently qualifies for a custom role. */
export function isEligible(
  member: GuildMember,
  config: BoosterConfig,
): boolean {
  if (member.premiumSince) return true;
  if (config.boosterRoleIds.length === 0) return false;
  return config.boosterRoleIds.some((id) => member.roles.cache.has(id));
}

/** Position a role just beneath the configured anchor, if any. Best-effort. */
async function positionRole(
  guild: Guild,
  role: Role,
  anchorRoleId: string | null,
): Promise<void> {
  if (!anchorRoleId) return;
  const anchor = guild.roles.cache.get(anchorRoleId);
  if (!anchor) return;

  const q = positionQueueFor(guild.id);
  await q.wait();
  try {
    await role.setPosition(Math.max(1, anchor.position - 1)).catch(() => null);
  } finally {
    q.shift();
  }
}

/** Create a role, place it under the anchor, and assign it to the owner. */
export async function createBoosterRole(
  member: GuildMember,
  name: string,
  color: number,
  config: BoosterConfig,
): Promise<Role> {
  const { guild } = member;
  const reason = `Booster custom role for ${member.user.tag} (${member.id})`;
  const role = await guild.roles.create({
    name,
    color: color || undefined,
    hoist: false,
    mentionable: false,
    reason,
  });
  await positionRole(guild, role, config.anchorRoleId);
  await member.roles.add(role, reason);
  return role;
}

/** Delete a custom role from Discord (no-op if it's already gone). */
export async function deleteBoosterRole(
  guild: Guild,
  roleId: string,
  reason: string,
): Promise<void> {
  const role = guild.roles.cache.get(roleId);
  if (role) await role.delete(reason).catch(() => null);
}

/** Grant an existing custom role to another member. */
export async function grantRole(
  guild: Guild,
  roleId: string,
  userId: string,
  reason: string,
): Promise<boolean> {
  const member = await guild.members.fetch(userId).catch(() => null);
  const role = guild.roles.cache.get(roleId);
  if (!member || !role) return false;
  await member.roles.add(role, reason).catch(() => null);
  return true;
}

/** Remove a custom role from a member (used on unshare / renounce). */
export async function revokeRole(
  guild: Guild,
  roleId: string,
  userId: string,
  reason: string,
): Promise<void> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member?.roles.cache.has(roleId))
    await member.roles.remove(roleId, reason).catch(() => null);
}

/** Post a card to a configured guild channel if it's set and sendable. */
export async function postToChannel(
  guild: Guild,
  channelId: string | null,
  card: CardReply,
): Promise<void> {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (channel?.isSendable()) await channel.send({ ...card }).catch(() => null);
  else
    container.logger.debug(`[booster-roles] channel ${channelId} unsendable`);
}
