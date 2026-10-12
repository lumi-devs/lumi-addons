import {
  type CommandContext,
  type CommandDef,
} from "@lumi-devs/lumi/commands";
import { SlashCommandBuilder } from "discord.js";
import { makeErrorCard, makeListCard } from "@lumi-devs/lumi/ui";
import { getConfessionsConfig } from "../utilities/Config.js";
import {
  banHash,
  deleteConfession,
  getConfession,
  listBans,
  unbanHash,
} from "../utilities/Data.js";

const HASH_RE = /^[0-9a-f]{64}$/i;
const relative = (at: number): string => `<t:${Math.floor(at / 1000)}:R>`;

async function log(
  ctx: CommandContext,
  title: string,
  body: string,
): Promise<void> {
  const config = await getConfessionsConfig(ctx.services, ctx.guildId!);
  if (!config.logChannelId) return;
  const channel = await ctx.services.client.channels.fetch(config.logChannelId).catch(() => null);
  if (channel && channel.isSendable()) {
    await channel.send(makeErrorCard(title, body)).catch(() => null);
  }
}

async function ban(ctx: CommandContext) {
  const guildId = ctx.guildId!;
  const number = await ctx.getInteger("number");
  if (number === null) return ctx.replyError("Error", "Provide a confession number.");
  const meta = await getConfession(ctx.services, guildId, number);
  if (!meta) return ctx.replyError("Error", `Confession #${number} was not found.`);

  await banHash(ctx.services, guildId, meta.authorHash, ctx.user.id);
  await log(
    ctx,
    "Author Banned",
    `The author of **Confession #${number}** was banned by <@${ctx.user.id}>.`,
  );
  return ctx.replySuccess(
    "Author Banned",
    `The anonymous author of **Confession #${number}** can no longer submit or reply.`,
  );
}

async function unban(ctx: CommandContext) {
  const guildId = ctx.guildId!;
  const target = ((await ctx.getString("target")) ?? "").trim();

  let hash: string;
  if (/^\d+$/.test(target)) {
    const meta = await getConfession(ctx.services, guildId, Number(target));
    if (!meta?.authorHash)
      return ctx.replyError("Error", `Confession #${target} was not found.`);
    hash = meta.authorHash;
  } else if (HASH_RE.test(target)) {
    hash = target.toLowerCase();
  } else {
    return ctx.replyError(
      "Error",
      "Provide a confession number or a 64-character author hash.",
    );
  }

  const removed = await unbanHash(ctx.services, guildId, hash);
  if (removed === 0) return ctx.replyError("Error", "That author was not banned.");

  await log(ctx, "Author Unbanned", `An author was unbanned by <@${ctx.user.id}>.`);
  return ctx.replySuccess("Unbanned", "The author can participate again.");
}

async function list(ctx: CommandContext) {
  const bans = await listBans(ctx.services, ctx.guildId!);
  if (bans.length === 0) {
    return ctx.reply(makeListCard("Banned Authors", ["No authors are currently banned."]));
  }
  const lines = bans.map(
    (b) => `\`${b.hash.slice(0, 16)}…\` — ${relative(b.record.at)} by <@${b.record.by}>`,
  );
  return ctx.reply(makeListCard("Banned Authors", lines));
}

async function removeConfession(ctx: CommandContext) {
  const guildId = ctx.guildId!;
  const number = await ctx.getInteger("number");
  if (number === null) return ctx.replyError("Error", "Provide a confession number.");
  const reason = (await ctx.getString("reason")) ?? "No reason given";
  const meta = await getConfession(ctx.services, guildId, number);
  if (!meta) return ctx.replyError("Error", `Confession #${number} was not found.`);

  const config = await getConfessionsConfig(ctx.services, guildId);
  const problems: string[] = [];
  if (config.channelId && meta.messageId) {
    const channel = await ctx.services.client.channels.fetch(config.channelId).catch(() => null);
    if (channel && "messages" in channel) {
      const msg = await channel.messages.fetch(meta.messageId).catch(() => null);
      if (msg) {
        await msg.delete().catch(() => {
          problems.push("its message could not be deleted");
        });
      }
    }
  }
  if (meta.threadId) {
    const thread = await ctx.services.client.channels.fetch(meta.threadId).catch(() => null);
    if (thread && "delete" in thread) {
      await thread.delete().catch(() => {
        problems.push("its thread could not be deleted");
      });
    }
  }
  await deleteConfession(ctx.services, guildId, number);

  await log(
    ctx,
    "Confession Deleted",
    `**Confession #${number}** was deleted by <@${ctx.user.id}>.\nReason: ${reason}`,
  );
  if (problems.length > 0) {
    return ctx.replyWarning(
      "Partially Deleted",
      `Confession #${number} was removed from the records, but ${problems.join(" and ")}.`,
    );
  }
  return ctx.replySuccess("Deleted", `Confession #${number} was removed.`);
}

export const confessmodDef: CommandDef = {
  name: "confessmod",
  description: "Moderate anonymous confessions (identity is never revealed).",
  guildOnly: true,
  requiredPermit: "mod.*",
  build: () =>
    new SlashCommandBuilder()
      .setName("confessmod")
      .setDescription("Moderate anonymous confessions (identity is never revealed).")
      .addSubcommand((sub) =>
        sub
          .setName("ban")
          .setDescription("Ban a confession's anonymous author by number.")
          .addIntegerOption((opt) =>
            opt
              .setName("number")
              .setDescription("Confession number")
              .setRequired(true)
              .setMinValue(1),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("unban")
          .setDescription("Unban an author by confession number or 64-char hash.")
          .addStringOption((opt) =>
            opt
              .setName("target")
              .setDescription("Confession number (e.g. 42) or 64-character hash")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("List banned author hashes in this server."),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete a confession by number.")
          .addIntegerOption((opt) =>
            opt
              .setName("number")
              .setDescription("Confession number")
              .setRequired(true)
              .setMinValue(1),
          )
          .addStringOption((opt) =>
            opt
              .setName("reason")
              .setDescription("Reason for deletion (logged to mod channel)")
              .setRequired(false),
          ),
      ),
  handlers: {
    ban,
    unban,
    list,
    delete: removeConfession,
  },
};
