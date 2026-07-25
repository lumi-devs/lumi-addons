import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;

  return false;
}

function isPrivateIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("ff")) return true;

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(lower);
  return mapped ? isPrivateIPv4(mapped[1]!) : false;
}

function isPrivateAddress(address: string): boolean {
  switch (isIP(address)) {
    case 4:
      return isPrivateIPv4(address);
    case 6:
      return isPrivateIPv6(address);
    default:
      return true;
  }
}

/**
 * Resolve a user-supplied URL only if it is public http(s) and does not map to
 * a private, loopback, or otherwise non-routable address.
 */
export async function resolvePublicHttpUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname;
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return null;
  }

  if (isIP(host) !== 0) {
    return isPrivateAddress(host) ? null : url;
  }

  const resolved = await lookup(host, { all: true }).catch(() => null);
  if (!resolved || resolved.length === 0) return null;
  if (resolved.some((entry) => isPrivateAddress(entry.address))) return null;

  return url;
}