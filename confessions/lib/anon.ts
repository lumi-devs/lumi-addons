import { createHash } from "node:crypto";

/**
 * Stable per-guild anonymization. The author of a confession is only ever
 * stored as `SHA-256(salt : userId)` with a per-guild random salt, so the
 * mapping can't be reversed without the salt and can't be correlated across
 * guilds. Moderation acts on the hash; identity is never persisted.
 */
export function hashAuthor(salt: string, userId: string): string {
  return createHash("sha256").update(`${salt}:${userId}`).digest("hex");
}

/** Human reply label within a confession thread: `#<confession>.<k>`. */
export function replyLabel(confessionNumber: number, k: number): string {
  return `#${confessionNumber}.${k}`;
}

const HTTP_URL = /^https?:\/\/\S+$/i;

/** Accept only http(s) URLs for optional attachments; returns null otherwise. */
export function sanitizeAttachmentUrl(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed && HTTP_URL.test(trimmed) ? trimmed : null;
}
