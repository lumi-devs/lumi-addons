import { container } from "@sapphire/framework";
import { isModuleEnabled } from "#utilities/listeners.js";
import { MODULE_NAME } from "../keys.js";
import { manageLounges } from "./manage.js";

/**
 * Broadcast reconcile: every worker sweeps its own guilds.cache. For each
 * enabled guild, a single `manageLounges` pass prunes dead registry entries and
 * removes/creates one lounge as needed — periodic self-heal on top of the
 * event-driven listener.
 */
export async function handleLoungeReconcileFire(): Promise<void> {
  const { client, logger } = container;
  for (const guild of client.guilds.cache.values()) {
    try {
      if (!(await isModuleEnabled(guild.id, MODULE_NAME))) continue;
      await manageLounges(guild);
    } catch (err) {
      logger.warn(`[multi-lounge] reconcile failed for ${guild.id}:`, err);
    }
  }
}
