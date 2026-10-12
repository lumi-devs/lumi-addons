import { createHash } from "node:crypto";

export async function hashAuthor(salt: string, userId: string): Promise<string> {
  return createHash("sha256").update(`${salt}:${userId}`, "utf8").digest("hex");
}

export function replyLabel(confessionNumber: number, k: number): string {
  return `#${confessionNumber}.${k}`;
}

const HTTP_URL = /^https?:\/\/\S+$/i;

export function sanitizeAttachmentUrl(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed && HTTP_URL.test(trimmed) ? trimmed : null;
}
