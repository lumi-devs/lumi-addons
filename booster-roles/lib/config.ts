import { container } from "@sapphire/framework";
import { getService } from "#core/module-system/Service.js";
import { MODULE_NAME } from "../keys.js";

export interface BoosterConfig {
  /** Roles that qualify a member for a custom role. Empty = native boost only. */
  boosterRoleIds: string[];
  /** Created roles are positioned just below this role. */
  anchorRoleId: string | null;
  /** Optional channel that announces newly created roles. */
  showcaseChannelId: string | null;
  /** Optional moderation/cleanup audit channel. */
  logChannelId: string | null;
  /** How many other members an owner may share their role with. */
  maxShares: number;
  /** Hours to wait after a boost lapses before deleting the role. */
  graceHours: number;
  /** Maximum role-name length this server allows. */
  nameMaxLength: number;
}

export async function getBoosterConfig(
  guildId: string,
): Promise<BoosterConfig> {
  const get = (key: string) =>
    container.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [boosterRoleIds, anchor, showcase, log, maxShares, grace, nameMax] =
    await Promise.all([
      getService("config").getConfigList(
        guildId,
        MODULE_NAME,
        "booster_role_ids",
      ),
      get("anchor_role_id"),
      get("showcase_channel_id"),
      get("log_channel_id"),
      get("max_shares"),
      get("grace_hours"),
      get("name_max_length"),
    ]);
  return {
    boosterRoleIds,
    anchorRoleId: (anchor as string | null) ?? null,
    showcaseChannelId: (showcase as string | null) ?? null,
    logChannelId: (log as string | null) ?? null,
    maxShares: (maxShares as number | null) ?? 3,
    graceHours: (grace as number | null) ?? 24,
    nameMaxLength: (nameMax as number | null) ?? 32,
  };
}
