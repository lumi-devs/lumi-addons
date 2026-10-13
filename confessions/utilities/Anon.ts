import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export async function hashAuthor(salt: string, userId: string): Promise<string> {
  return createHash("sha256").update(`${salt}:${userId}`, "utf8").digest("hex");
}

const SEAL_VERSION = "v1";
const SNOWFLAKE = /^\d{17,20}$/;

let sealKey: Buffer | null = null;

function sealFile(): string {
  const dir = process.env.CONFESSIONS_DATA_DIR?.trim() || path.join(process.cwd(), "data", "confessions");
  return path.join(dir, "seal.key");
}

export function getSealKey(): Buffer {
  if (sealKey) return sealKey;
  const file = sealFile();
  try {
    sealKey = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
  } catch {
    sealKey = null;
  }
  if (sealKey && sealKey.length === 32) return sealKey;
  if (sealKey) throw new Error(`[confessions] corrupt seal key at ${file}; delete it to mint a fresh one`);
  sealKey = randomBytes(32);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, sealKey.toString("hex"), { mode: 0o600 });
  return sealKey;
}

export function sealUserId(userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSealKey(), iv);
  const body = Buffer.concat([cipher.update(userId, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SEAL_VERSION, iv.toString("base64url"), body.toString("base64url"), tag.toString("base64url")].join(".");
}

export function openSealedId(sealed: string): string | null {
  const [version, iv, body, tag] = sealed.split(".");
  if (version !== SEAL_VERSION || !iv || !body || !tag) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", getSealKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const userId = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
    return SNOWFLAKE.test(userId) ? userId : null;
  } catch {
    return null;
  }
}

export function hmacUserId(userId: string): string {
  return createHmac("sha256", getSealKey()).update(userId, "utf8").digest("hex");
}
