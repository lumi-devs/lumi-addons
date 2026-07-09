export const MODULE_NAME = "confessions";

/** KV scope (targetId) for guild-wide state: salt + counter. */
export const CONFIG_SCOPE = "config";
export const SALT_KEY = "salt";
export const COUNTER_KEY = "counter";
/** Per-confession rows use `c:<number>` as targetId. */
export const confessionTarget = (n: number) => `c:${n}`;
export const CONFESSION_META_KEY = "meta";
export const REPLY_COUNTER_KEY = "replies";
/** Per-reply author rows use `r:<messageId>` as targetId. */
export const replyTarget = (messageId: string) => `r:${messageId}`;
export const AUTHOR_KEY = "author";
/** Banned-hash rows use the author hash as targetId. */
export const BAN_KEY = "ban";

export const ConfessKeys = {
  /** Per-author submit cooldown; TTL = configured minutes. */
  cooldown: (guildId: string, hash: string) =>
    `lumi:addon:confessions:cd:${guildId}:${hash}`,
} as const;

export interface ConfessionMeta {
  number: number;
  messageId: string;
  threadId: string | null;
  authorHash: string;
  createdAt: number;
}

export interface BanRecord {
  at: number;
  by: string;
}
