import { container } from "@sapphire/framework";
import { isModuleEnabled } from "#utilities/listeners.js";
import { MODULE_NAME } from "../keys.js";
import type { BoosterGracePayload } from "../scheduled-tasks/graceDelete.js";
import { getBoosterConfig } from "./config.js";
import { getRole } from "./data.js";
import { isEligible } from "./roles.js";
import { removeOwnerRole } from "./cleanup.js";

/**
 * Boost-loss grace expiry. Broadcast to every worker; only the one holding the
 * guild acts. Re-checks eligibility first, so a member who re-boosted (or
 * regained a qualifying role) inside the grace window keeps their role.
 */
export async function handleBoosterGraceFire(
  payload: BoosterGracePayload,
): Promise<void> {
  const { guildId, ownerId } = payload;
  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) return;
  if (!(await isModuleEnabled(guildId, MODULE_NAME))) return;

  const record = await getRole(guildId, ownerId);
  if (!record) return;

  const config = await getBoosterConfig(guildId);
  const member = await guild.members.fetch(ownerId).catch(() => null);
  if (member && isEligible(member, config)) return; // re-boosted — keep it.

  await removeOwnerRole(
    guild,
    record,
    "Booster boost lapsed (grace period expired)",
    config,
    "their boost lapsed",
  );
}
