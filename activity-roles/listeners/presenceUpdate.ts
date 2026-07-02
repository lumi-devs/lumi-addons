import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Presence } from "discord.js";
import { checkModulesEnabled } from "#lib/module-check.js";
import { MODULE_NAME } from "../lib/keys.js";
import { getMappings } from "../lib/store.js";
import { matchActivities } from "../lib/matcher.js";

@ApplyOptions<Listener.Options>({
  name: "activityRolesPresenceUpdate",
  event: Events.PresenceUpdate,
})
export class ActivityRolesPresenceListener extends Listener<
  typeof Events.PresenceUpdate
> {
  public async run(
    _oldPresence: Presence | null,
    newPresence: Presence,
  ): Promise<void> {
    if (!newPresence.guild || !newPresence.member) return;

    // Check if the module is enabled in this guild
    const states = await checkModulesEnabled(newPresence.guild.id, [
      MODULE_NAME,
    ]);
    if (!states.get(MODULE_NAME)) return;

    const mappings = await getMappings(newPresence.guild.id);
    if (mappings.length === 0) return;

    // Get the roles that the user should have based on their current activities
    const rolesToHave = new Set(
      matchActivities(newPresence.activities, mappings),
    );

    // Get all roles managed by this module
    const managedRoleIds = new Set(mappings.map((m) => m.roleId));

    const { member } = newPresence;
    const currentRoles = member.roles.cache;

    const rolesToAdd: string[] = [];
    const rolesToRemove: string[] = [];

    // Figure out which managed roles need to be removed (user has them, but shouldn't)
    for (const roleId of managedRoleIds) {
      if (currentRoles.has(roleId) && !rolesToHave.has(roleId)) {
        rolesToRemove.push(roleId);
      }
    }

    // Figure out which managed roles need to be added (user doesn't have them, but should)
    for (const roleId of rolesToHave) {
      if (!currentRoles.has(roleId)) {
        rolesToAdd.push(roleId);
      }
    }

    // Apply changes
    if (rolesToAdd.length > 0 || rolesToRemove.length > 0) {
      try {
        if (rolesToRemove.length > 0) {
          await member.roles.remove(
            rolesToRemove,
            "Activity Roles: Activity ended",
          );
        }
        if (rolesToAdd.length > 0) {
          await member.roles.add(
            rolesToAdd,
            "Activity Roles: Activity started",
          );
        }
      } catch (error) {
        this.container.logger.error(
          `[ActivityRoles] Failed to update roles for ${member.user.tag}:`,
          error,
        );
      }
    }
  }
}
