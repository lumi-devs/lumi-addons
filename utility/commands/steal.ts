import { ApplyOptions } from "@sapphire/decorators";
import { BaseCommand } from "lumi/commands";
import type { ApplicationCommandRegistry, Args } from "@sapphire/framework";
import { type ChatInputCommandInteraction, Message, PermissionFlagsBits, Guild } from "discord.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeWarningCard,
  makeInfoCard,
  Emojis,
} from "lumi/ui";

const EMOJI_REGEX = /<(a?):([a-zA-Z0-9_]+):([0-9]+)>/g;

async function downloadImage(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: status ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("The URL does not point to a valid image/gif.");
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, contentType };
}

async function createEmoji(
  guild: Guild,
  url: string,
  name: string,
): Promise<{ success: boolean; emoji?: any; error?: string }> {
  try {
    const { buffer } = await downloadImage(url);
    if (buffer.length > 256 * 1024) {
      return {
        success: false,
        error: "Image size exceeds Discord's 256 KB limit.",
      };
    }
    const emoji = await guild.emojis.create({ attachment: buffer, name });
    return { success: true, emoji };
  } catch (err: any) {
    let errorMsg = err.message || "Unknown error";
    if (err.code === 30008) {
      errorMsg = "Maximum number of custom emojis reached for this server.";
    } else if (err.code === 50013) {
      errorMsg = "I lack permissions to manage emojis in this server.";
    } else if (errorMsg.includes("size")) {
      errorMsg = "The image is too large (must be under 256 KB).";
    }
    return { success: false, error: errorMsg };
  }
}

function sanitizeEmojiName(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  const baseName = dotIndex === -1 ? name : name.slice(0, dotIndex);
  let sanitized = baseName.replace(/[^a-zA-Z0-9_]/g, "");
  sanitized = sanitized.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (sanitized.length < 2) {
    sanitized = `emoji_${sanitized || "stolen"}`;
  }
  if (sanitized.length > 32) {
    sanitized = sanitized.slice(0, 32);
  }
  return sanitized;
}

@ApplyOptions<BaseCommand.Options>({
  name: "steal",
  aliases: ["emoji-steal", "steal-emoji", "addemoji", "add-emoji"],
  description:
    "Steal custom emojis from messages, replies, or URLs and add them to the server.",
  preconditions: ["GuildOnly"],
  requiredClientPermissions: [PermissionFlagsBits.ManageGuildExpressions],
  requiredUserPermissions: [PermissionFlagsBits.ManageGuildExpressions],
  prefixEnabled: true,
})
export class StealCommand extends BaseCommand {
  public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((opt) =>
          opt
            .setName("emoji_or_url")
            .setDescription("The custom emoji or direct image URL to steal")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Custom name for the new emoji")
            .setRequired(false),
        ),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    await interaction.deferReply();

    const input = interaction.options.getString("emoji_or_url", true);
    const customName = interaction.options.getString("name");

    const emojiMatch = input.match(/<(a?):([a-zA-Z0-9_]+):([0-9]+)>/);
    if (emojiMatch) {
      const isAnimated = Boolean(emojiMatch[1]);
      const originalName = emojiMatch[2] || "emoji";
      const id = emojiMatch[3];
      const name = customName
        ? sanitizeEmojiName(customName)
        : sanitizeEmojiName(originalName);
      const emojiUrl = `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? "gif" : "png"}`;

      const result = await createEmoji(interaction.guild, emojiUrl, name);
      if (result.success && result.emoji) {
        return interaction.editReply(
          makeSuccessCard(
            "Emoji Added",
            `Successfully created custom emoji ${result.emoji} (\`:${result.emoji.name}:\`).`,
          ),
        );
      }
      return interaction.editReply(
        makeErrorCard("Steal Failed", `Failed to create emoji: ${result.error}`),
      );
    }

    if (input.startsWith("http://") || input.startsWith("https://")) {
      if (!customName) {
        return interaction.editReply(
          makeErrorCard(
            "Missing Name",
            "When stealing from a URL, please specify a name option.",
          ),
        );
      }
      const name = sanitizeEmojiName(customName);
      const result = await createEmoji(interaction.guild, input, name);
      if (result.success && result.emoji) {
        return interaction.editReply(
          makeSuccessCard(
            "Emoji Added",
            `Successfully created custom emoji ${result.emoji} (\`:${result.emoji.name}:\`) from URL.`,
          ),
        );
      }
      return interaction.editReply(
        makeErrorCard("Steal Failed", `Failed to create emoji from URL: ${result.error}`),
      );
    }

    return interaction.editReply(
      makeErrorCard(
        "Invalid Argument",
        "Please provide a valid custom emoji or direct image URL.",
      ),
    );
  }
  public override async messageRun(message: Message, args: Args) {
    if (!message.guild) return;

    const arg1 = await args.pick("string").catch(() => null);
    const arg2 = await args.pick("string").catch(() => null);

    if (!arg1) {
      const repliedMessageId = message.reference?.messageId;
      if (repliedMessageId) {
        let repliedMessage: Message;
        try {
          repliedMessage =
            await message.channel.messages.fetch(repliedMessageId);
        } catch {
          return message.reply(
            makeErrorCard(
              "Steal Failed",
              "Could not fetch the replied message. Make sure I have access to view channel history.",
            ),
          );
        }

        // 1. Check for custom emojis in replied message content
        const emojiMatches = [...repliedMessage.content.matchAll(EMOJI_REGEX)];
        if (emojiMatches.length > 0) {
          const uniqueEmojis = Array.from(
            new Map(emojiMatches.map((m) => [m[3], m])).values(),
          );

          const maxSteals = 5;
          const toSteal = uniqueEmojis.slice(0, maxSteals);
          const feedbackMsg = await message.reply(
            makeInfoCard(
              "Stealing Emojis",
              `${Emojis.LOADING} Processing and uploading ${toSteal.length} emoji(s)...`,
            ),
          );

          const succeeded: string[] = [];
          const failed: { name: string; reason: string }[] = [];

          for (const match of toSteal) {
            const isAnimated = Boolean(match[1]);
            const originalName = match[2] || "emoji";
            const id = match[3];
            const name = sanitizeEmojiName(originalName);
            const emojiUrl = `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? "gif" : "png"}`;

            const result = await createEmoji(message.guild, emojiUrl, name);
            if (result.success && result.emoji) {
              succeeded.push(`${result.emoji} (\`:${result.emoji.name}:\`)`);
            } else {
              failed.push({
                name: originalName,
                reason: result.error || "Unknown error",
              });
            }
          }

          const descParts: string[] = [];
          if (succeeded.length > 0) {
            descParts.push(`### Succeeded:\n${succeeded.join("\n")}`);
          }
          if (failed.length > 0) {
            descParts.push(
              `### Failed:\n${failed.map((f) => `❌ **:${f.name}:** — ${f.reason}`).join("\n")}`,
            );
          }
          if (uniqueEmojis.length > maxSteals) {
            descParts.push(
              `\n-# *Note: Capped at ${maxSteals} emojis per command to prevent rate limits.*`,
            );
          }

          await feedbackMsg.edit(
            makeSuccessCard("Emoji Stealer Results", descParts.join("\n\n")),
          );
          return;
        }

        // 2. Check for image attachments in replied message
        const attachment = repliedMessage.attachments.find((a) =>
          Boolean(a.contentType?.startsWith("image/")),
        );
        if (attachment) {
          const name = sanitizeEmojiName(attachment.name || "stolen_emoji");
          const feedbackMsg = await message.reply(
            makeInfoCard(
              "Stealing Emoji",
              `${Emojis.LOADING} Downloading attachment and creating emoji...`,
            ),
          );

          const result = await createEmoji(message.guild, attachment.url, name);
          if (result.success && result.emoji) {
            await feedbackMsg.edit(
              makeSuccessCard(
                "Emoji Added",
                `Successfully created custom emoji ${result.emoji} (\`:${result.emoji.name}:\`) from attachment.`,
              ),
            );
          } else {
            await feedbackMsg.edit(
              makeErrorCard(
                "Steal Failed",
                `Failed to create emoji from attachment: ${result.error}`,
              ),
            );
          }
          return;
        }

        return message.reply(
          makeErrorCard(
            "Nothing to Steal",
            "The replied message does not contain any custom emojis or image attachments.",
          ),
        );
      }

      // No arguments and not a reply
      return message.reply(
        makeWarningCard(
          "Usage Guide",
          [
            "Here are the ways you can use the `,steal` command:",
            "",
            "1. **Steal a custom emoji directly**:",
            "   `,steal <emoji> [custom_name]`",
            "   *Example: `,steal :blob_cool: super_cool`*",
            "",
            "2. **Steal from a URL**:",
            "   `,steal <image_url> <emoji_name>`",
            "   *Example: `,steal https://example.com/logo.png my_logo`*",
            "",
            "3. **Reply to a message**:",
            "   Reply to any message containing emojis or an image and type `,steal`.",
          ].join("\n"),
        ),
      );
    }

    // arg1 is present
    const emojiMatch = arg1.match(/<(a?):([a-zA-Z0-9_]+):([0-9]+)>/);
    if (emojiMatch) {
      // Case A: Custom Emoji Argument
      const isAnimated = Boolean(emojiMatch[1]);
      const originalName = emojiMatch[2] || "emoji";
      const id = emojiMatch[3];
      const name = arg2
        ? sanitizeEmojiName(arg2)
        : sanitizeEmojiName(originalName);
      const emojiUrl = `https://cdn.discordapp.com/emojis/${id}.${isAnimated ? "gif" : "png"}`;

      const feedbackMsg = await message.reply(
        makeInfoCard(
          "Stealing Emoji",
          `${Emojis.LOADING} Processing and uploading custom emoji...`,
        ),
      );

      const result = await createEmoji(message.guild, emojiUrl, name);
      if (result.success && result.emoji) {
        await feedbackMsg.edit(
          makeSuccessCard(
            "Emoji Added",
            `Successfully created custom emoji ${result.emoji} (\`:${result.emoji.name}:\`).`,
          ),
        );
      } else {
        await feedbackMsg.edit(
          makeErrorCard(
            "Steal Failed",
            `Failed to create emoji: ${result.error}`,
          ),
        );
      }
      return;
    }

    // Check if it's a URL
    if (arg1.startsWith("http://") || arg1.startsWith("https://")) {
      // Case B: URL Argument
      if (!arg2) {
        return message.reply(
          makeErrorCard(
            "Missing Name",
            "When stealing from a URL, you must specify a custom name:\n`,steal <url> <emoji_name>`",
          ),
        );
      }

      const name = sanitizeEmojiName(arg2);
      const feedbackMsg = await message.reply(
        makeInfoCard(
          "Stealing Emoji",
          `${Emojis.LOADING} Downloading image from URL and uploading...`,
        ),
      );

      const result = await createEmoji(message.guild, arg1, name);
      if (result.success && result.emoji) {
        await feedbackMsg.edit(
          makeSuccessCard(
            "Emoji Added",
            `Successfully created custom emoji ${result.emoji} (\`:${result.emoji.name}:\`) from URL.`,
          ),
        );
      } else {
        await feedbackMsg.edit(
          makeErrorCard(
            "Steal Failed",
            `Failed to create emoji from URL: ${result.error}`,
          ),
        );
      }
      return;
    }

    // Invalid argument
    return message.reply(
      makeErrorCard(
        "Invalid Argument",
        "Please provide a valid custom emoji or direct image URL, or reply to a message containing emojis.",
      ),
    );
  }
}
