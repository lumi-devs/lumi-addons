import type { Guild } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { makeInfoCard } from "lumi/ui";
import type { RoleRecord } from "../keys.js";
import type { BoosterConfig } from "./config.js";
import { deleteRole, getRole, withGuildLock } from "./data.js";
import { deleteBoosterRole, postToChannel, revokeRole } from "./roles.js";

/**
 * Fully retire an owner's custom role: strip it from everyone it was shared
 * with, delete the Discord role, drop the stored record, and log it. Used by
 * both the grace-expiry handler and the periodic reconcile sweep — and can
 * legitimately race a moderator's `/boosterroles delete` or the owner's own
 * "Delete" button, so the KV drop is guarded by the guild lock and re-checks
 * the record still exists. Whoever wins the race does the Discord-side
 * cleanup and logs it; the loser is a silent no-op.
 */
export async function removeOwnerRole(
  guild: Guild,
  record: RoleRecord,
  reason: string,
  config: BoosterConfig,
  note: string,
): Promise<void> {
  const won = await withGuildLock(guild.id, async () => {
    if (!(await getRole(guild.id, record.ownerId))) return false;
    await deleteRole(guild.id, record.ownerId);
    return true;
  });
  if (!won) return;

  for (const sharedId of record.sharedWith)
    await revokeRole(guild, record.roleId, sharedId, reason);
  await deleteBoosterRole(guild, record.roleId, reason);
  await postToChannel(
    guild,
    config.logChannelId,
    makeInfoCard(
      "🗑️ Booster Role Removed",
      `${userMention(record.ownerId)}'s custom role **${record.name}** was removed — ${note}.`,
    ),
  );
}
