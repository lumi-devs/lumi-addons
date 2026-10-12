import { SlashCommandBuilder, type Guild } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { makeSuccessCard } from "@lumi-devs/lumi/ui";
import {
  emojiImageUrl,
  emojiMention,
  hasManageEmojiPermission,
  isHttpUrl,
  parseEmojis,
  parseMessageRef,
  sanitizeEmojiName,
  type ParsedEmoji,
} from "../utilities/Emoji.js";

const MAX_STEALS = 5;
const MAX_IMAGE_BYTES = 256 * 1024;

async function downloadImage(url: string): Promise<{ data: Buffer } | { error: string }> {
  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
  } catch {
    return { error: "Could not download the source image." };
  }
  if (!res.ok) return { error: `Could not download the source image (status ${res.status}).` };
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return { error: "The URL does not point to an image." };
  const ab = await res.arrayBuffer();
  if (ab.byteLength > MAX_IMAGE_BYTES) return { error: "Image exceeds the 256 KB size limit." };
  return { data: Buffer.from(ab) };
}

async function uploadEmoji(
  guild: Guild,
  name: string,
  image: { data: Buffer } | { error: string },
): Promise<{ id: string } | { error: string }> {
  if ("error" in image) return image;
  try {
    const created = await guild.emojis.create({ attachment: image.data, name });
    return { id: created.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Maximum number of emojis"))
      return { error: "This server has reached its custom emoji limit." };
    if (message.includes("Missing Permissions"))
      return { error: "I lack the Manage Emojis permission in this server." };
    return { error: message || "Unknown error" };
  }
}

async function stealFromUrl(
  ctx: CommandContext,
  guild: Guild,
  url: string,
  customName: string | null,
): Promise<void> {
  const name = sanitizeEmojiName(customName ?? url.split("/").pop() ?? "emoji");
  const image = await downloadImage(url);
  const result = await uploadEmoji(guild, name, image);
  if ("error" in result) {
    await ctx.replyError("Steal Failed", `Failed to create emoji from URL: ${result.error}`);
    return;
  }
  await ctx.reply(makeSuccessCard("Emoji Stolen", `Added <:${name}:${result.id}> \`:${name}:\``));
}

async function stealFromEmojis(
  ctx: CommandContext,
  guild: Guild,
  emojis: ParsedEmoji[],
): Promise<void> {
  const targets = emojis.slice(0, MAX_STEALS);
  const stolen: string[] = [];
  const failed: string[] = [];

  for (const source of targets) {
    const url = emojiImageUrl(source.id, source.animated);
    const image = await downloadImage(url);
    const result = await uploadEmoji(guild, source.name, image);
    if ("error" in result) {
      failed.push(`:${source.name}: — ${result.error}`);
    } else {
      stolen.push(emojiMention(source.name, result.id, source.animated));
    }
  }

  const parts: string[] = [];
  if (stolen.length > 0) parts.push(`**Stolen:** ${stolen.join(" ")}`);
  if (failed.length > 0) parts.push(`### Failed:\n${failed.map((f) => `X **${f}**`).join("\n")}`);
  const body = parts.join("\n\n") || "Nothing was stolen.";

  if (stolen.length > 0) {
    await ctx.reply(makeSuccessCard("Emojis Stolen", body));
  } else {
    await ctx.replyError("Steal Failed", body);
  }
}

async function run(ctx: CommandContext): Promise<void> {
  const { guild } = ctx;
  if (!guild) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }

  const memberPerms = ctx.member?.permissions;
  const permsStr =
    typeof memberPerms === "string"
      ? memberPerms
      : memberPerms != null && "bitfield" in memberPerms
        ? String((memberPerms as { bitfield: bigint }).bitfield)
        : null;

  if (!hasManageEmojiPermission(permsStr)) {
    await ctx.replyError(
      "Missing Permission",
      "You need the **Manage Emojis** permission to use this command.",
    );
    return;
  }

  if (ctx.isSlash) await ctx.defer({ ephemeral: false });

  const input = ((await ctx.getString("emoji_or_url")) ?? "").trim();
  const customName = ((await ctx.getString("name")) ?? "").trim() || null;

  if (isHttpUrl(input)) {
    await stealFromUrl(ctx, guild, input, customName);
    return;
  }

  const ref = input ? parseMessageRef(input, ctx.channelId) : null;
  if (ref) {
    const ch = guild.channels.cache.get(ref.channelId);
    if (!ch?.isTextBased()) {
      await ctx.replyError("Steal Failed", "Could not find that channel.");
      return;
    }
    let msg: { content: string };
    try {
      msg = await ch.messages.fetch(ref.messageId);
    } catch {
      await ctx.replyError("Steal Failed", "Could not fetch that message.");
      return;
    }
    const emojis = parseEmojis(msg.content);
    if (emojis.length === 0) {
      await ctx.replyError("No Emojis", "That message contains no custom emojis.");
      return;
    }
    await stealFromEmojis(ctx, guild, emojis);
    return;
  }

  const replied = !ctx.isSlash && ctx.message.reference
    ? await ctx.message.fetchReference().catch(() => null)
    : null;

  const sources: string[] = [];
  if (input) sources.push(input);
  if (replied) sources.push(replied.content);
  if (sources.length === 0) {
    await ctx.replyError("Nothing to Steal", "Provide an emoji, URL, or reply to a message.");
    return;
  }

  const emojis = parseEmojis(...sources);
  if (emojis.length === 0) {
    await ctx.replyError("No Emojis", "No custom emojis found to steal.");
    return;
  }

  if (customName && emojis.length === 1) {
    const first = emojis[0]!;
    first.name = sanitizeEmojiName(customName);
  }

  await stealFromEmojis(ctx, guild, emojis);
}

export const stealDef: CommandDef = {
  name: "steal",
  module: "utility",
  description: "Steal custom emojis from messages, replies, or URLs and add them to the server.",
  guildOnly: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("steal")
      .setDescription(
        "Steal custom emojis from messages, replies, or URLs and add them to the server.",
      )
      .addStringOption((opt) =>
        opt
          .setName("emoji_or_url")
          .setDescription("Custom emoji, image URL, or message link/ID to steal from")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt.setName("name").setDescription("Custom name for the new emoji").setRequired(false),
      ),
  run,
};
