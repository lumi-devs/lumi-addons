import { createHash } from "node:crypto";
import {
  dataFile,
  hmacWith,
  loadOrMintKeyFile,
  openSealedString,
  sealString,
} from "@lumi-devs/lumi/seal";

export async function hashAuthor(salt: string, userId: string): Promise<string> {
  return createHash("sha256").update(`${salt}:${userId}`, "utf8").digest("hex");
}

const SNOWFLAKE = /^\d{17,20}$/;

export function getSealKey(): Buffer {
  return loadOrMintKeyFile(dataFile("confessions", "seal.key"));
}

export function sealUserId(userId: string): string {
  return sealString(getSealKey(), userId);
}

export function openSealedId(sealed: string): string | null {
  const userId = openSealedString(getSealKey(), sealed);
  return userId && SNOWFLAKE.test(userId) ? userId : null;
}

export function hmacUserId(userId: string): string {
  return hmacWith(getSealKey(), userId);
}
