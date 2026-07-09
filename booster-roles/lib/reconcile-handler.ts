import { container } from "@sapphire/framework";
import { isModuleEnabled } from "#utilities/listeners.js";
import { MODULE_NAME } from "../keys.js";
import { getBoosterConfig } from "./config.js";
import { listRoles, deleteRole } from "./data.js";
import { isEligible } from "./roles.js";
import { removeOwnerRole } from "./cleanup.js";

/**
 * Periodic self-heal: each worker sweeps its own guilds.cache. For every stored
 * record whose owner left, whose Discord role no longer exists, or whose owner
 * is no longer eligible, tidy up the drift.
 */
export async function handleBoosterReconcileFire(): Promise<void> {
  const { client, logger } = container;
  for (const guild of client.guilds.cache.values()) {
    try {
      if (!(await isModuleEnabled(guild.id, MODULE_NAME))) continue;
      const config = await getBoosterConfig(guild.id);

      for (const record of await listRoles(guild.id)) {
        const role = guild.roles.cache.get(record.roleId);
        if (!role) {
          // Ghost entry — the role was deleted outside the bot.
          await deleteRole(guild.id, record.ownerId);
          continue;
        }
        const member = await guild.members
          .fetch(record.ownerId)
          .catch(() => null);
        if (!member) {
          await removeOwnerRole(
            guild,
            record,
            "Owner left the server",
            config,
            "the owner left",
          );
        } else if (!isEligible(member, config)) {
          await removeOwnerRole(
            guild,
            record,
            "Owner no longer boosting",
            config,
            "their boost lapsed",
          );
        }
      }
    } catch (err) {
      logger.warn(`[booster-roles] reconcile failed for ${guild.id}:`, err);
    }
  }
}
