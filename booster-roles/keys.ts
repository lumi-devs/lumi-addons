export const MODULE_NAME = "booster-roles";

/** One custom-role record per owner: targetId = ownerId, key = "role". */
export const ROLE_KEY = "role";
/** One blacklist record per user: targetId = userId, key = "blacklist". */
export const BLACKLIST_KEY = "blacklist";

/** Stable BullMQ job id for a pending boost-loss grace deletion. */
export const graceJobId = (guildId: string, ownerId: string) =>
  `booster-grace:${guildId}:${ownerId}`;

/** A booster's personal role, keyed in KV by the owner's user id. */
export interface RoleRecord {
  roleId: string;
  ownerId: string;
  name: string;
  /** Discord integer colour (0 = default/no colour). */
  color: number;
  createdAt: number;
  /** User ids the owner has granted the role to (excludes the owner). */
  sharedWith: string[];
}

export interface BlacklistRecord {
  at: number;
  by: string;
  reason?: string;
}
