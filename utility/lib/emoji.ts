const EMOJI_RE = /<(a?):([a-zA-Z0-9_]+):([0-9]+)>/g;
const MESSAGE_LINK_RE = /discord\.com\/channels\/\d+\/(\d+)\/(\d+)/;
const MESSAGE_ID_RE = /^\d{15,25}$/;

export interface ParsedEmoji {
  animated: boolean;
  name: string;
  id: string;
}

export function parseEmojis(...contents: string[]): ParsedEmoji[] {
  const seen = new Map<string, ParsedEmoji>();
  for (const content of contents) {
    for (const m of content.matchAll(EMOJI_RE)) {
      if (!seen.has(m[3]!)) {
        seen.set(m[3]!, {
          animated: m[1] === "a",
          name: m[2] || "emoji",
          id: m[3]!,
        });
      }
    }
  }
  return [...seen.values()];
}

export function sanitizeEmojiName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  let out = base
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (out.length < 2) out = `emoji_${out || "stolen"}`;
  return out.length > 32 ? out.slice(0, 32) : out;
}

export function emojiImageUrl(id: string, animated: boolean): string {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`;
}

export function emojiMention(
  name: string,
  id: string,
  animated: boolean,
): string {
  return animated ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
}

export function isHttpUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

export interface MessageRef {
  channelId: string;
  messageId: string;
}

export function parseMessageRef(
  input: string,
  currentChannelId: string,
): MessageRef | null {
  const link = MESSAGE_LINK_RE.exec(input);
  if (link) return { channelId: link[1]!, messageId: link[2]! };
  if (MESSAGE_ID_RE.test(input)) {
    return { channelId: currentChannelId, messageId: input };
  }
  return null;
}

const MANAGE_EMOJIS_BIT = 1n << 30n;
const ADMINISTRATOR_BIT = 1n << 3n;

export function hasManageEmojiPermission(
  permissions: string | null | undefined,
): boolean {
  if (!permissions) return true;
  try {
    return (
      (BigInt(permissions) & (MANAGE_EMOJIS_BIT | ADMINISTRATOR_BIT)) !== 0n
    );
  } catch {
    return true;
  }
}
