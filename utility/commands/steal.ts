import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  DiscordAPIError,
  type Guild,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import { type StealOutcome, type StolenEmoji, stealResultCard } from "../ui.js";

const ModuleName = "utility";
const MAX_STEALS = 5;
const MAX_IMAGE_BYTES = 256 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const EMOJI_PATTERN = /<(a?):([A-Za-z0-9_]+):(\d+)>/g;
const MESSAGE_ID_PATTERN = /^\d{15,25}$/;
const NAME_PATTERN = /^[A-Za-z0-9_]{2,32}$/;
const DISCORD_HOST_PATTERN = /^(?:(?:www|canary|ptb)\.)?discord(?:app)?\.com$/i;

interface ParsedEmoji {
  animated: boolean;
  name: string;
  id: string;
}

interface MessageRef {
  guildId: string | null;
  channelId: string;
  messageId: string;
}

interface DownloadResult {
  data: Buffer;
}

interface DownloadError {
  error: string;
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function parseMessageRef(
  input: string,
  currentGuildId: string,
  currentChannelId: string,
): MessageRef | null {
  if (MESSAGE_ID_PATTERN.test(input)) {
    return { guildId: currentGuildId, channelId: currentChannelId, messageId: input };
  }
  const url = parseHttpUrl(input);
  if (!url || !DISCORD_HOST_PATTERN.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter((part) => part.length > 0);
  if (parts.length < 4 || parts[0] !== "channels") return null;
  const guildId = parts[1];
  const channelId = parts[2];
  const messageId = parts[3];
  if (
    !guildId ||
    !channelId ||
    !messageId ||
    !MESSAGE_ID_PATTERN.test(guildId) ||
    !MESSAGE_ID_PATTERN.test(channelId) ||
    !MESSAGE_ID_PATTERN.test(messageId)
  ) {
    return null;
  }
  return { guildId, channelId, messageId };
}

function parseEmojis(contents: readonly string[]): ParsedEmoji[] {
  const seen = new Map<string, ParsedEmoji>();
  for (const content of contents) {
    for (const match of content.matchAll(EMOJI_PATTERN)) {
      const name = match[2];
      const id = match[3];
      if (!name || !id || seen.has(id)) continue;
      seen.set(id, { animated: match[1] === "a", name, id });
    }
  }
  return [...seen.values()];
}

function sanitizeName(raw: string): string {
  const dot = raw.lastIndexOf(".");
  const base = dot >= 0 ? raw.slice(0, dot) : raw;
  let name = base
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!name) name = "emoji";
  if (name.length < 2) name = `emoji_${name}`;
  return name.slice(0, 32);
}

function inferNameFromUrl(url: URL): string {
  const segments = url.pathname.split("/").filter((part) => part.length > 0);
  const last = segments.at(-1) ?? "";
  try {
    return sanitizeName(decodeURIComponent(last));
  } catch {
    return sanitizeName(last);
  }
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const first = octets[0]!;
  const second = octets[1]!;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIpv6(host: string): boolean {
  const value = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("::ffff:")) return isPrivateIpv4(value.slice(7));
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  return /^fe[89ab]/.test(value);
}

function isBlockedHost(host: string): boolean {
  const value = host.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!value) return true;
  if (
    value === "localhost" ||
    value.endsWith(".localhost") ||
    value.endsWith(".local") ||
    value.endsWith(".internal")
  ) {
    return true;
  }
  const version = isIP(value);
  if (version === 4) return isPrivateIpv4(value);
  if (version === 6) return isPrivateIpv6(value);
  return false;
}

async function isSafeImageUrl(value: string): Promise<boolean> {
  const url = parseHttpUrl(value);
  if (!url || url.username || url.password) return false;
  if (isBlockedHost(url.hostname)) return false;
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0) return true;
  try {
    const records = await lookup(url.hostname, { all: true, verbatim: true });
    if (records.length === 0) return false;
    return records.every((record) => !isBlockedHost(record.address));
  } catch {
    return false;
  }
}

async function readCapped(response: Response, limit: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  const body = response.body;
  if (!body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > limit ? null : buffer;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function detectImageType(data: Buffer): "png" | "jpeg" | "gif" | null {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "jpeg";
  }
  if (data.length >= 6) {
    const header = data.subarray(0, 6).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") return "gif";
  }
  return null;
}

async function downloadImage(value: string): Promise<DownloadResult | DownloadError> {
  if (!(await isSafeImageUrl(value))) return { error: "That URL is not allowed." };
  let response: Response;
  try {
    response = await fetch(value, {
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch {
    return { error: "Could not download the image." };
  }
  if (!response.ok) {
    return { error: `Could not download the image (HTTP ${response.status}).` };
  }
  const contentType =
    (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    contentType &&
    contentType !== "application/octet-stream" &&
    !contentType.startsWith("image/")
  ) {
    return { error: "That URL does not point to an image." };
  }
  const data = await readCapped(response, MAX_IMAGE_BYTES);
  if (!data) return { error: "Images must be 256 KB or smaller." };
  if (!detectImageType(data)) {
    return { error: "Unsupported image format. Use PNG, JPEG, or GIF." };
  }
  return { data };
}

function describeEmojiError(error: unknown): string {
  if (error instanceof DiscordAPIError) {
    if (error.code === 30008) return "This server has reached its custom emoji limit.";
    if (error.code === 50013) {
      return "I lack the Manage Emojis and Stickers permission here.";
    }
    if (error.code === 50035) {
      return "Discord rejected the image. It may be too large, corrupt, unsupported, or animated emojis may not be available at this server's boost tier.";
    }
    return error.message || "Discord rejected the emoji.";
  }
  if (error instanceof Error) return error.message || "Unknown error.";
  return "Unknown error.";
}

async function createEmoji(
  guild: Guild,
  name: string,
  data: Buffer,
): Promise<{ emoji: StolenEmoji } | { error: string }> {
  try {
    const created = await guild.emojis.create({ attachment: data, name });
    return {
      emoji: { name: created.name ?? name, id: created.id, animated: created.animated },
    };
  } catch (error) {
    return { error: describeEmojiError(error) };
  }
}

async function stealEmojis(
  guild: Guild,
  emojis: readonly ParsedEmoji[],
  customName: string | null,
): Promise<StealOutcome> {
  const targets = emojis.slice(0, MAX_STEALS);
  if (targets.length === 0) {
    return { stolen: [], failed: ["No custom emojis found to steal."] };
  }
  if (customName && targets.length > 1) {
    return {
      stolen: [],
      failed: ["The name option can only be used when stealing a single emoji."],
    };
  }
  const stolen: StolenEmoji[] = [];
  const failed: string[] = [];
  for (const target of targets) {
    const name = customName ?? sanitizeName(target.name);
    const image = await downloadImage(
      `https://cdn.discordapp.com/emojis/${target.id}.${target.animated ? "gif" : "png"}`,
    );
    if ("error" in image) {
      failed.push(`:${name}: ${image.error}`);
      continue;
    }
    const created = await createEmoji(guild, name, image.data);
    if ("error" in created) {
      failed.push(`:${name}: ${created.error}`);
    } else {
      stolen.push(created.emoji);
    }
  }
  return { stolen, failed };
}

async function stealUrl(
  guild: Guild,
  url: URL,
  customName: string | null,
): Promise<StealOutcome> {
  const name = customName ?? inferNameFromUrl(url);
  const image = await downloadImage(url.toString());
  if ("error" in image) {
    return { stolen: [], failed: [`${name}: ${image.error}`] };
  }
  const created = await createEmoji(guild, name, image.data);
  if ("error" in created) {
    return { stolen: [], failed: [`${name}: ${created.error}`] };
  }
  return { stolen: [created.emoji], failed: [] };
}

async function fetchMessageContents(
  guild: Guild,
  ref: MessageRef,
): Promise<{ contents: string[] } | { error: string }> {
  const channel = await guild.client.channels.fetch(ref.channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    return { error: "Could not find that text channel." };
  }
  const message = await channel.messages.fetch(ref.messageId).catch(() => null);
  if (!message) return { error: "Could not fetch that message." };
  const contents = [message.content];
  if (message.reference?.messageId) {
    const referenced = await message.fetchReference().catch(() => null);
    if (referenced) contents.push(referenced.content);
  }
  return { contents };
}

async function runSteal(
  guild: Guild,
  input: string,
  customName: string | null,
  channelId: string,
): Promise<StealOutcome> {
  const ref = parseMessageRef(input, guild.id, channelId);
  if (ref) {
    if (ref.guildId && ref.guildId !== guild.id) {
      return { stolen: [], failed: ["That message belongs to another server."] };
    }
    const fetched = await fetchMessageContents(guild, ref);
    if ("error" in fetched) return { stolen: [], failed: [fetched.error] };
    return stealEmojis(guild, parseEmojis(fetched.contents), customName);
  }
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const url = parseHttpUrl(input);
    if (!url) return { stolen: [], failed: ["That URL is not valid."] };
    return stealUrl(guild, url, customName);
  }
  return stealEmojis(guild, parseEmojis([input]), customName);
}

export const stealCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("steal")
    .setDescription("Add custom emojis to this server from an emoji, image URL, or message.")
    .addStringOption((option) =>
      option
        .setName("emoji_or_url")
        .setDescription("Custom emoji, image URL, or Discord message link/ID")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Name for the new emoji (letters, numbers, underscores)")
        .setRequired(false),
    ),
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Guild Only", "This command only works inside a server."),
        ),
      );
      return;
    }
    if (!services.modules.isEnabled(guild.id, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Module Disabled", "The Utility module is disabled in this server."),
        ),
      );
      return;
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageEmojisAndStickers)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permission",
            "You need the Manage Emojis and Stickers permission to use this command.",
          ),
        ),
      );
      return;
    }
    const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!me?.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permission",
            "I need the Manage Emojis and Stickers permission to add emojis.",
          ),
        ),
      );
      return;
    }
    const input = interaction.options.getString("emoji_or_url", true).trim();
    const customName = interaction.options.getString("name")?.trim() ?? null;
    if (customName && !NAME_PATTERN.test(customName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Name",
            "Emoji names must be 2-32 characters using only letters, numbers, and underscores.",
          ),
        ),
      );
      return;
    }
    if (!input) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Nothing to Steal",
            "Provide a custom emoji, an image URL, or a Discord message link/ID.",
          ),
        ),
      );
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const outcome = await runSteal(guild, input, customName, interaction.channelId);
      await interaction.editReply(stealResultCard(outcome));
    } catch (error) {
      services.observability.logger.warn("steal command failed", {
        guildId: guild.id,
        error,
      });
      await interaction.editReply(
        makeErrorCard("Steal Failed", "An unexpected error occurred while stealing emojis."),
      );
    }
  },
};
