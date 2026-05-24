import { ApplyOptions } from "@sapphire/decorators";
import { Args } from "@sapphire/framework";
import { Message, PermissionFlagsBits } from "discord.js";
import { EmberSubcommand } from "#lib/commands.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
} from "#utilities/cards.js";

@ApplyOptions<EmberSubcommand.Options>({
  name: "tag",
  description: "Create, manage, and display custom server tags.",
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "add", messageRun: "messageRunAdd" },
    { name: "create", messageRun: "messageRunAdd" },
    { name: "set", messageRun: "messageRunAdd" },
    { name: "remove", messageRun: "messageRunRemove" },
    { name: "delete", messageRun: "messageRunRemove" },
    { name: "del", messageRun: "messageRunRemove" },
    { name: "list", messageRun: "messageRunList" },
    { name: "show", messageRun: "messageRunShow", default: true },
  ],
})
export class TagCommand extends EmberSubcommand {
  public async messageRunShow(message: Message, args: Args) {
    const tagName = await args.pick("string").catch(() => null);
    if (!tagName) {
      return message.reply(
        makeErrorCard(
          "Missing Tag Name",
          "Usage: `,tag <name>` or `,tag list`",
        ),
      );
    }

    const guildId = message.guildId!;
    const key = `ember:tags:${guildId}:${tagName.toLowerCase()}`;
    const content = await this.container.redis.get(key);

    if (!content) {
      return message.reply(
        makeErrorCard(
          "Tag Not Found",
          `The tag **${tagName}** does not exist.`,
        ),
      );
    }

    return message.reply({
      content,
      allowedMentions: { parse: [] }, // Avoid unexpected role/member pings in custom tags
    });
  }

  public async messageRunAdd(message: Message, args: Args) {
    const { member } = message;
    if (
      !member ||
      !member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return message.reply(
        makeErrorCard(
          "Permission Denied",
          "You must have the `Manage Messages` permission to create or modify tags.",
        ),
      );
    }

    const name = await args.pick("string").catch(() => null);
    const content = await args.rest("string").catch(() => null);

    if (!name || !content) {
      return message.reply(
        makeErrorCard("Usage", "`,tag add <name> <content>`"),
      );
    }

    const sanitizedName = name.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "");
    if (
      !sanitizedName ||
      sanitizedName.length < 2 ||
      sanitizedName.length > 30
    ) {
      return message.reply(
        makeErrorCard(
          "Invalid Name",
          "Tag name must be 2-30 characters long, alphanumeric, hyphens, and underscores only.",
        ),
      );
    }

    // Block names that conflict with subcommands
    const reserved = [
      "add",
      "create",
      "set",
      "remove",
      "delete",
      "del",
      "list",
      "show",
    ];
    if (reserved.includes(sanitizedName)) {
      return message.reply(
        makeErrorCard(
          "Reserved Keyword",
          `**${sanitizedName}** is a reserved subcommand keyword and cannot be used as a tag name.`,
        ),
      );
    }

    const guildId = message.guildId!;
    const key = `ember:tags:${guildId}:${sanitizedName}`;
    const listKey = `ember:tags:${guildId}`;

    await this.container.redis.set(key, content);
    await this.container.redis.sadd(listKey, sanitizedName);

    return message.reply(
      makeSuccessCard(
        "Tag Created",
        `Successfully created/updated tag **${sanitizedName}**.\nUse \`,tag ${sanitizedName}\` to trigger it.`,
      ),
    );
  }

  public async messageRunRemove(message: Message, args: Args) {
    const { member } = message;
    if (
      !member ||
      !member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return message.reply(
        makeErrorCard(
          "Permission Denied",
          "You must have the `Manage Messages` permission to remove tags.",
        ),
      );
    }

    const name = await args.pick("string").catch(() => null);
    if (!name) {
      return message.reply(makeErrorCard("Usage", "`,tag remove <name>`"));
    }

    const sanitizedName = name.toLowerCase();
    const guildId = message.guildId!;
    const key = `ember:tags:${guildId}:${sanitizedName}`;
    const listKey = `ember:tags:${guildId}`;

    const exists = await this.container.redis.sismember(listKey, sanitizedName);
    if (!exists) {
      return message.reply(
        makeErrorCard(
          "Tag Not Found",
          `The tag **${sanitizedName}** does not exist.`,
        ),
      );
    }

    await this.container.redis.del(key);
    await this.container.redis.srem(listKey, sanitizedName);

    return message.reply(
      makeSuccessCard(
        "Tag Removed",
        `Successfully removed tag **${sanitizedName}**.`,
      ),
    );
  }

  public async messageRunList(message: Message) {
    const guildId = message.guildId!;
    const listKey = `ember:tags:${guildId}`;
    const tags = await this.container.redis.smembers(listKey);

    if (!tags.length) {
      return message.reply(
        makeInfoCard(
          "No Tags Found",
          "This server has no custom tags yet. Create one with `,tag add <name> <content>`.",
        ),
      );
    }

    const sortedTags = tags.sort();
    return message.reply(
      makeInfoCard(
        "Custom Tags",
        sortedTags.map((t) => `• \`${t}\``).join("\n"),
      ),
    );
  }
}
