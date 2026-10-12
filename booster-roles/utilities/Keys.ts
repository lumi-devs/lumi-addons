export const MODULE_NAME = "booster-roles";

export const BoosterKeys = {
  ROLE: "role",
  BLACKLIST: "blacklist",
  GRACE: "grace",
} as const;

export const BoosterOneshots = {
  GRACE_EXPIRE: "grace-expire",
} as const;

export const InteractionIds = {
  CREATE: "booster-roles:role:create",
  RENAME: "booster-roles:role:rename",
  RECOLOR: "booster-roles:role:recolor",
  SHARE: "booster-roles:role:share",
  SHARES: "booster-roles:role:shares",
  DELETE: "booster-roles:role:delete",
  DELETE_CONFIRM: "booster-roles:role:delete:confirm",
  NAME_MODAL_CREATE: "booster-roles:modal:name:create",
  NAME_MODAL_RENAME: "booster-roles:modal:name:rename",
  COLOR_MODAL: "booster-roles:modal:color",
  SHARE_MODAL: "booster-roles:modal:share",
  UNSHARE_SELECT: "booster-roles:select:unshare",
} as const;

export const InteractionPrefixes = {
  ROLE: "booster-roles:role:",
  MODAL: "booster-roles:modal:",
  SELECT: "booster-roles:select:",
} as const;
