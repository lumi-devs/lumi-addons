import type { CommandDefinition, ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  ephemeralCard,
  makeEmptyCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { ModuleName, readConfig, type Config } from "../config.js";
import {
  banAuthor,
  deleteConfessionRecords,
  getConfession,
  listRecentConfessions,
  unbanAuthor,
  type ConfessionRecord,
} from "../data.js";
import { buildConfessionList } from "../ui.js";

type CommandInteraction = Parameters<CommandDefinition["execute"]>[0];

interface ModerationContext {
  guildId: string;
  config: Config;
}

async function readContext(
  interaction: CommandInteraction,
  services: ModuleServices,
): Promise<ModerationContext | null> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Server Only", "This command can only be used in a server."),
      ),
    );
    return null;
  }
  if (!services.modules.isEnabled(guildId, ModuleName)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Module Disabled",
          "The Confessions module is disabled on this server.",
        ),
      ),
    );
    return null;
  }
  return { guildId, config: await readConfig(services, guildId) };
}

async function requireManageMessages(
  interaction: CommandInteraction,
): Promise<boolean> {
  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
  ) {
    return true;
  }
  await interaction.reply(
    ephemeralCard(
      makeErrorCard(
        "Missing Permissions",
        "You need the **Manage Messages** permission to moderate confessions.",
      ),
    ),
  );
  return false;
}

function readNumber(interaction: CommandInteraction): number | null {
  const value = interaction.options.getInteger("number", false);
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
}

async function logModeration(
  services: ModuleServices,
  config: Config,
  number: number,
  action: string,
): Promise<void> {
  if (!config.logChannelId) return;
  const channel = await services.client.channels
    .fetch(config.logChannelId)
    .catch(() => null);
  if (!channel?.isSendable()) return;
  await channel
    .send(
      cardCreateOptions(
        makeInfoCard("Confession Moderation", [
          `**Confession #${number}** — ${action}`,
        ]),
      ),
    )
    .catch(() => undefined);
}

async function removeDiscordContent(
  services: ModuleServices,
  record: ConfessionRecord,
): Promise<string[]> {
  const problems: string[] = [];
  const { index } = record;

  if (index.threadId) {
    const thread = await services.client.channels
      .fetch(index.threadId)
      .catch(() => null);
    if (thread?.isThread()) {
      try {
        await thread.delete();
      } catch {
        problems.push("its thread could not be deleted");
      }
    }
  }

  const channel = await services.client.channels
    .fetch(index.channelId)
    .catch(() => null);
  if (channel?.isTextBased() && "messages" in channel) {
    const message = await channel.messages
      .fetch(index.messageId)
      .catch(() => null);
    if (message) {
      try {
        await message.delete();
      } catch {
        problems.push("its message could not be deleted");
      }
    }
  }

  return problems;
}

export const confessionsCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("confessions")
    .setDescription("Moderate anonymous confessions without revealing authors.")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("ban")
        .setDescription("Ban the anonymous author of a confession.")
        .addIntegerOption((option) =>
          option
            .setName("number")
            .setDescription("Confession number")
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("unban")
        .setDescription("Unban an anonymous author by confession number or hash.")
        .addIntegerOption((option) =>
          option
            .setName("number")
            .setDescription("Confession number")
            .setRequired(false)
            .setMinValue(1),
        )
        .addStringOption((option) =>
          option
            .setName("hash")
            .setDescription("64-character author hash")
            .setMinLength(64)
            .setMaxLength(64)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a confession and its thread.")
        .addIntegerOption((option) =>
          option
            .setName("number")
            .setDescription("Confession number")
            .setRequired(true)
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List recent confession numbers."),
    ),
  guildOnly: true,
  requiredPermit: "mod.*",
  async execute(interaction, services) {
    const subcommand = interaction.options.getSubcommand(true);
    const context = await readContext(interaction, services);
    if (!context) return;
    const { guildId, config } = context;

    if (subcommand === "list") {
      const items = await listRecentConfessions(services, guildId);
      await interaction.reply(
        ephemeralCard(
          items.length === 0
            ? makeEmptyCard(
                "No Confessions",
                "No confessions have been posted in this server yet.",
                "Use `/confess` to post the first one.",
              )
            : buildConfessionList(guildId, items, 0, interaction.user.id),
        ),
      );
      return;
    }

    if (!(await requireManageMessages(interaction))) return;

    if (subcommand === "unban") {
      const rawHash = interaction.options.getString("hash")?.trim().toLowerCase();
      const number = rawHash ? null : readNumber(interaction);
      if (!rawHash && number === null) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Missing Target",
              "Provide a confession number or a 64-character author hash.",
            ),
          ),
        );
        return;
      }
      if (rawHash && !/^[0-9a-f]{64}$/.test(rawHash)) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Invalid Hash",
              "The author hash must be 64 hexadecimal characters.",
            ),
          ),
        );
        return;
      }

      let hash = rawHash;
      if (!hash && number !== null) {
        const record = await getConfession(services, guildId, number);
        if (!record) {
          await interaction.reply(
            ephemeralCard(
              makeErrorCard(
                "Not Found",
                `Confession #${number} does not exist in this server.`,
              ),
            ),
          );
          return;
        }
        hash = record.meta.authorHash;
      }
      if (!hash) return;

      const removed = await unbanAuthor(services, guildId, hash);
      if (removed === 0) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Not Banned",
              "That author is not currently banned.",
            ),
          ),
        );
        return;
      }
      await logModeration(
        services,
        config,
        number ?? 0,
        number === null ? "author unbanned by hash" : "author unbanned",
      );
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard(
            "Author Unbanned",
            "The author can participate again.",
          ),
        ),
      );
      return;
    }

    const number = readNumber(interaction);
    if (number === null) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Invalid Number", "Provide a confession number."),
        ),
      );
      return;
    }

    const record = await getConfession(services, guildId, number);
    if (!record) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Found",
            `Confession #${number} does not exist in this server.`,
          ),
        ),
      );
      return;
    }

    if (subcommand === "ban") {
      await banAuthor(services, guildId, record.meta.authorHash, number);
      await logModeration(services, config, number, "author banned");
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard(
            "Author Banned",
            `The anonymous author of **Confession #${number}** can no longer submit confessions or replies.`,
          ),
        ),
      );
      return;
    }

    if (subcommand === "unban") {
      const removed = await unbanAuthor(
        services,
        guildId,
        record.meta.authorHash,
      );
      if (removed === 0) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Not Banned",
              `The author of **Confession #${number}** is not banned.`,
            ),
          ),
        );
        return;
      }
      await logModeration(services, config, number, "author unbanned");
      await interaction.reply(
        ephemeralCard(
          makeSuccessCard(
            "Author Unbanned",
            `The author of **Confession #${number}** can participate again.`,
          ),
        ),
      );
      return;
    }

    if (subcommand === "delete") {
      const problems = await removeDiscordContent(services, record);
      await deleteConfessionRecords(
        services,
        guildId,
        number,
        record.index.messageId,
      );
      await logModeration(services, config, number, "deleted");

      const body = `**Confession #${number}** was removed.`;
      if (problems.length > 0) {
        await interaction.reply(
          ephemeralCard(
            makeWarningCard(
              "Partially Deleted",
              `${body} However, ${problems.join(" and ")}.`,
            ),
          ),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(makeSuccessCard("Deleted", body)),
      );
    }
  },
};
