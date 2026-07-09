import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import type { ChatInputCommandInteraction, Guild } from "discord.js";
import { userMention, time, TimestampStyles } from "@discordjs/formatters";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import {
  ephemeralCard,
  makeSuccessCard,
  makeErrorCard,
  makeListCard,
  noPingCard,
  type CardReply,
} from "#utilities/cards.js";
import { getConfessionsConfig } from "../lib/config.js";
import {
  banHash,
  deleteConfession,
  getConfession,
  listBans,
  unbanHash,
} from "../lib/data.js";

const HASH_RE = /^[0-9a-f]{64}$/i;

@ApplyOptions<BaseSubcommand.Options>({
  name: "confessmod",
  description: "Moderate anonymous confessions (identity is never revealed).",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  subcommands: [
    { name: "ban", chatInputRun: "chatInputRunBan" },
    { name: "unban", chatInputRun: "chatInputRunUnban" },
    { name: "list", chatInputRun: "chatInputRunList" },
    { name: "delete", chatInputRun: "chatInputRunDelete" },
  ],
})
export class ConfessModCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("ban")
            .setDescription("Ban a confession's anonymous author by number.")
            .addIntegerOption((o) =>
              o
                .setName("number")
                .setDescription("The confession number.")
                .setRequired(true)
                .setMinValue(1),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("unban")
            .setDescription("Unban by confession number or author hash.")
            .addStringOption((o) =>
              o
                .setName("target")
                .setDescription("A confession number or a 64-char author hash.")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s.setName("list").setDescription("List banned author hashes."),
        )
        .addSubcommand((s) =>
          s
            .setName("delete")
            .setDescription("Delete a confession (and its thread) by number.")
            .addIntegerOption((o) =>
              o
                .setName("number")
                .setDescription("The confession number.")
                .setRequired(true)
                .setMinValue(1),
            )
            .addStringOption((o) =>
              o.setName("reason").setDescription("Logged reason (optional)."),
            ),
        ),
    );
  }

  public async chatInputRunBan(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const number = interaction.options.getInteger("number", true);
    const meta = await getConfession(guild.id, number);
    if (!meta)
      return this.#err(interaction, `Confession #${number} was not found.`);

    await banHash(guild.id, meta.authorHash, interaction.user.id);
    await this.#log(
      guild,
      makeSuccessCard(
        "Author Banned",
        `The author of **Confession #${number}** was banned by ${userMention(interaction.user.id)}.`,
      ),
    );
    return this.reply(
      interaction,
      ephemeralCard(
        makeSuccessCard(
          "Author Banned",
          `The anonymous author of **Confession #${number}** can no longer submit or reply.`,
        ),
      ),
    );
  }

  public async chatInputRunUnban(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const target = interaction.options.getString("target", true).trim();

    let hash: string | null = null;
    if (/^\d+$/.test(target)) {
      const meta = await getConfession(guild.id, Number(target));
      hash = meta?.authorHash ?? null;
      if (!hash)
        return this.#err(interaction, `Confession #${target} was not found.`);
    } else if (HASH_RE.test(target)) {
      hash = target.toLowerCase();
    } else {
      return this.#err(
        interaction,
        "Provide a confession number or a 64-character author hash.",
      );
    }

    const removed = await unbanHash(guild.id, hash);
    if (removed === 0)
      return this.#err(interaction, "That author was not banned.");

    await this.#log(
      guild,
      makeSuccessCard(
        "Author Unbanned",
        `An author was unbanned by ${userMention(interaction.user.id)}.`,
      ),
    );
    return this.reply(
      interaction,
      ephemeralCard(
        makeSuccessCard("Unbanned", "The author can participate again."),
      ),
    );
  }

  public async chatInputRunList(interaction: ChatInputCommandInteraction) {
    const bans = await listBans(interaction.guild!.id);
    const lines = bans.map(
      (b) =>
        `\`${b.hash.slice(0, 16)}…\` — ${time(new Date(b.record.at), TimestampStyles.RelativeTime)} by ${userMention(b.record.by)}`,
    );
    return this.reply(
      interaction,
      ephemeralCard(noPingCard(makeListCard("Banned Authors", lines))),
    );
  }

  public async chatInputRunDelete(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const number = interaction.options.getInteger("number", true);
    const reason = interaction.options.getString("reason") ?? "No reason given";
    const meta = await getConfession(guild.id, number);
    if (!meta)
      return this.#err(interaction, `Confession #${number} was not found.`);

    const config = await getConfessionsConfig(guild.id);
    if (config.channelId) {
      const channel = guild.channels.cache.get(config.channelId);
      if (channel?.isTextBased())
        await channel.messages.delete(meta.messageId).catch(() => null);
    }
    if (meta.threadId)
      await guild.channels.cache
        .get(meta.threadId)
        ?.delete("confessions: moderator delete")
        .catch(() => null);
    await deleteConfession(guild.id, number);

    await this.#log(
      guild,
      makeErrorCard(
        "Confession Deleted",
        `**Confession #${number}** was deleted by ${userMention(interaction.user.id)}.\nReason: ${reason}`,
      ),
    );
    return this.reply(
      interaction,
      ephemeralCard(
        makeSuccessCard(
          "Deleted",
          `Confession #${number} and its thread were removed.`,
        ),
      ),
    );
  }

  #err(interaction: ChatInputCommandInteraction, message: string) {
    return this.reply(
      interaction,
      ephemeralCard(makeErrorCard("Error", message)),
    );
  }

  async #log(guild: Guild, card: CardReply) {
    const config = await getConfessionsConfig(guild.id);
    if (!config.logChannelId) return;
    const channel = guild.channels.cache.get(config.logChannelId);
    if (channel?.isSendable())
      await channel.send({ ...card }).catch(() => null);
  }
}
