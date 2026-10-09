import { defineCommand, type CommandContext } from "lumi/commands";
import { emoji, messages } from "lumi/discord";
import { Emojis, makeInfoCard } from "lumi/ui";
import {
  emojiImageUrl,
  emojiMention,
  hasManageEmojiPermission,
  isHttpUrl,
  parseEmojis,
  parseMessageRef,
  sanitizeEmojiName,
} from "../lib/emoji.js";

const MAX_STEALS = 5;
const MAX_IMAGE_BYTES = 256 * 1024;

async function downloadImage(
  url: string,
): Promise<{ bytes: Uint8Array; contentType: string } | { error: string }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { error: "Could not download the source image." };
  }
  if (!res.ok) {
    return { error: `Could not download the source image (status ${res.status}).` };
  }
  const contentType = (res.headers.get("content-type") ?? "")
    .split(";")[0]!
    .trim();
  if (!contentType.startsWith("image/")) {
    return { error: "The URL does not point to an image." };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { error: "The image is too large (must be under 256 KB)." };
  }
  return { bytes, contentType };
}

async function uploadEmoji(
  guildId: string,
  imageUrl: string,
  name: string,
): Promise<{ id: string } | { error: string }> {
  const image = await downloadImage(imageUrl);
  if ("error" in image) return image;
  const attachment = `data:${image.contentType};base64,${Buffer.from(image.bytes).toString("base64")}`;
  try {
    return await emoji.create(guildId, name, attachment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/maximum number of .* emojis/i.test(message)) {
      return { error: "This server has reached its custom emoji limit." };
    }
    if (/missing permissions|manage.*emoji/i.test(message)) {
      return { error: "I lack the Manage Emojis permission in this server." };
    }
    return { error: message || "Unknown error" };
  }
}

async function stealDirect(
  ctx: CommandContext,
  guildId: string,
  imageUrl: string,
  name: string,
  animated: boolean,
  fromUrl: boolean,
): Promise<void> {
  const result = await uploadEmoji(guildId, imageUrl, name);
  if ("error" in result) {
    await ctx.replyError(
      "Steal Failed",
      `${fromUrl ? "Failed to create emoji from URL" : "Failed to create emoji"}: ${result.error}`,
    );
    return;
  }
  await ctx.replySuccess(
    "Emoji Added",
    `Created ${emojiMention(name, result.id, animated)} (\`:${name}:\`)${fromUrl ? " from URL" : ""}.`,
  );
}

async function stealFromMessage(
  ctx: CommandContext,
  guildId: string,
  channelId: string,
  messageId: string,
  customName: string | null,
): Promise<void> {
  const target = await messages.fetch(channelId, messageId).catch(() => null);
  if (!target) {
    await ctx.replyError(
      "Steal Failed",
      "Could not fetch that message. Check the link/ID and that I can view the channel.",
    );
    return;
  }
  const parent = target.repliedToId
    ? await messages.fetch(channelId, target.repliedToId).catch(() => null)
    : null;

  const all = parseEmojis(target.content, parent?.content ?? "");
  const sources = all.slice(0, MAX_STEALS);
  if (sources.length === 0) {
    await ctx.replyError(
      "Nothing to Steal",
      "That message does not contain any custom emojis.",
    );
    return;
  }

  await ctx.reply(
    makeInfoCard(
      "Stealing Emojis",
      `${Emojis.Loading} Uploading ${sources.length} emoji(s)...`,
    ),
  );

  const succeeded: string[] = [];
  const failed: string[] = [];
  for (const source of sources) {
    const name =
      customName && sources.length === 1
        ? sanitizeEmojiName(customName)
        : sanitizeEmojiName(source.name);
    const result = await uploadEmoji(
      guildId,
      emojiImageUrl(source.id, source.animated),
      name,
    );
    if ("error" in result) {
      failed.push(`:${source.name}: — ${result.error}`);
    } else {
      succeeded.push(
        `${emojiMention(name, result.id, source.animated)} (\`:${name}:\`)`,
      );
    }
  }

  const parts: string[] = [];
  const quote = parent?.content || target.content;
  if (quote) {
    const snippet = quote.length > 200 ? `${quote.slice(0, 200)}…` : quote;
    parts.push(`> ${snippet.split("\n").join("\n> ")}`);
  }
  if (succeeded.length > 0) parts.push(`### Succeeded:\n${succeeded.join("\n")}`);
  if (failed.length > 0) {
    parts.push(`### Failed:\n${failed.map((f) => `❌ **${f}**`).join("\n")}`);
  }
  if (all.length > sources.length) {
    parts.push(`Skipped ${all.length - sources.length} more (max ${MAX_STEALS} per command).`);
  }
  await ctx.replySuccess("Emoji Stealer Results", parts.join("\n\n"));
}

async function run(ctx: CommandContext): Promise<void> {
  if (!ctx.guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  if (ctx.isSlash) await ctx.defer();
  if (!hasManageEmojiPermission(ctx.member?.permissions)) {
    await ctx.replyError(
      "Missing Permission",
      "You need the Manage Emojis and Stickers permission to steal emojis.",
    );
    return;
  }

  const guildId = ctx.guildId;
  const input = ((await ctx.getString("emoji_or_url")) ?? "").trim();
  const customName = ((await ctx.getString("name")) ?? "").trim() || null;
  if (!input) {
    await ctx.replyWarning(
      "Usage Guide",
      [
        "Steal a custom emoji: `steal <emoji> [name]`",
        "Steal from an image URL: `steal <image_url> <name>`",
        "Steal from a message: `steal <message_link_or_id> [name]`",
      ].join("\n"),
    );
    return;
  }

  const ref = parseMessageRef(input, ctx.channelId);
  if (ref) {
    await stealFromMessage(ctx, guildId, ref.channelId, ref.messageId, customName);
    return;
  }

  const single = parseEmojis(input)[0];
  if (single) {
    const name = sanitizeEmojiName(customName ?? single.name);
    await stealDirect(
      ctx,
      guildId,
      emojiImageUrl(single.id, single.animated),
      name,
      single.animated,
      false,
    );
    return;
  }

  if (isHttpUrl(input)) {
    if (!customName) {
      await ctx.replyError(
        "Missing Name",
        "When stealing from a URL, provide a `name` for the new emoji.",
      );
      return;
    }
    await stealDirect(
      ctx,
      guildId,
      input,
      sanitizeEmojiName(customName),
      input.toLowerCase().endsWith(".gif"),
      true,
    );
    return;
  }

  await ctx.replyError(
    "Invalid Argument",
    "Provide a custom emoji, an image URL, or a message link/ID.",
  );
}

export default defineCommand({
  name: "steal",
  description:
    "Steal custom emojis from messages, replies, or URLs and add them to the server.",
  build: () => ({
    name: "steal",
    description:
      "Steal custom emojis from messages, replies, or URLs and add them to the server.",
    options: [
      {
        type: 3,
        name: "emoji_or_url",
        description:
          "Custom emoji, image URL, or message link/ID to steal from",
        required: false,
      },
      {
        type: 3,
        name: "name",
        description: "Custom name for the new emoji",
        required: false,
      },
    ],
  }),
  run,
});
