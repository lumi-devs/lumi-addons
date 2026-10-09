export const MODULE_NAME = "confessions";

export const CONFIG_SCOPE = "config";
export const SALT_KEY = "salt";
export const COUNTER_KEY = "counter";
export const CONFESSION_META_KEY = "meta";
export const REPLY_COUNTER_KEY = "replies";
export const BAN_KEY = "ban";
export const COOLDOWN_KEY = "cooldown";

export const confessionTarget = (n: number) => `c:${n}`;
export const replyKey = (k: number) => `r:${k}`;

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
}

export interface BanRecord {
  at: number;
  by: string;
}
