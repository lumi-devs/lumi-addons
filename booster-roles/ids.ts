export const IdPrefix = "booster-roles:";

export const Ids = {
  panel: (userId: string) => `${IdPrefix}panel:${userId}`,
  shared: (userId: string) => `${IdPrefix}shared:${userId}`,
  sharedPage: (userId: string) => `${IdPrefix}shared-page:${userId}`,
  create: (userId: string) => `${IdPrefix}create:${userId}`,
  rename: (userId: string) => `${IdPrefix}rename:${userId}`,
  color: (userId: string) => `${IdPrefix}color:${userId}`,
  share: (userId: string) => `${IdPrefix}share:${userId}`,
  manage: (userId: string) => `${IdPrefix}manage:${userId}`,
  unshare: (userId: string) => `${IdPrefix}unshare:${userId}`,
  renounce: (userId: string) => `${IdPrefix}renounce:${userId}`,
  delete: (userId: string) => `${IdPrefix}delete:${userId}`,
  deleteConfirm: (userId: string) => `${IdPrefix}delete-confirm:${userId}`,
  deleteCancel: (userId: string) => `${IdPrefix}delete-cancel:${userId}`,
  modalCreate: (userId: string) => `${IdPrefix}modal-create:${userId}`,
  modalRename: (userId: string) => `${IdPrefix}modal-rename:${userId}`,
  modalColor: (userId: string) => `${IdPrefix}modal-color:${userId}`,
  adminBlacklistPage: (userId: string) =>
    `${IdPrefix}admin-blacklist-page:${userId}`,
} as const;

export interface ParsedInteractionId {
  action: string;
  userId: string;
  rest: string[];
}

export function parseInteractionId(
  customId: string,
): ParsedInteractionId | null {
  const [prefix, action, userId, ...rest] = customId.split(":");
  if (prefix !== "booster-roles" || !action || !userId) return null;
  return { action, userId, rest };
}
