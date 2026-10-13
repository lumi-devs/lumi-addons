export const MODULE_NAME = "confessions";

export const CONFIG_SCOPE = "config";
export const SALT_KEY = "salt";
export const COUNTER_KEY = "counter";
export const CONFESSION_META_KEY = "meta";
export const REPLY_COUNTER_KEY = "replies";
export const BAN_KEY = "ban";
export const COOLDOWN_KEY = "cooldown";
export const DM_OPT_OUT_KEY = "dm-optout";

export const confessionTarget = (n: number): string => `c:${n}`;
export const replyKey = (k: number): string => `r:${k}`;

export const confessionAuthorKey = (n: number): string => `author:c:${n}`;
export const replyAuthorKey = (n: number, k: number): string => `author:r:${n}:${k}`;

const AUTHOR_IDX_PREFIX = "author-idx:";

export const confessionAuthorIdxKey = (n: number): string => `${AUTHOR_IDX_PREFIX}c:${n}`;
export const replyAuthorIdxKey = (n: number, k: number): string => `${AUTHOR_IDX_PREFIX}r:${n}:${k}`;

export function authorKeyForIdxKey(idxKey: string): string | null {
  if (!idxKey.startsWith(AUTHOR_IDX_PREFIX)) return null;
  return `author:${idxKey.slice(AUTHOR_IDX_PREFIX.length)}`;
}

export interface ConfessionMeta {
  number: number;
  messageId: string;
  threadId: string | null;
  authorHash: string;
  createdAt: number;
  title?: string | null;
  text: string;
  imageUrl?: string | null;
}

export interface ReplyRecord {
  number: number;
  k: number;
  authorHash: string;
  text: string;
  createdAt: number;
  messageId: string | null;
}

export interface BanRecord {
  at: number;
  by: string;
}
