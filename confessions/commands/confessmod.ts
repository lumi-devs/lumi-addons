import { defineCommand, type CommandContext } from "lumi/commands";
import { makeErrorCard, makeListCard } from "lumi/ui";
import { channels, messages, threads } from "lumi/discord";
import { getConfessionsConfig } from "../lib/config.js";
import {
  banHash,
  deleteConfession,
  getConfession,
  listBans,
  unbanHash,
} from "../lib/data.js";

const HASH_RE = /^[0-9a-f]{64}$/i;

const relative = (at: number): string => `<t:${Math.floor(at / 1000)}:R>`;

async function log(
  guildId: string,
  title: string,
  body: string,
): Promise<void> {
  const config = await getConfessionsConfig(guildId);
  if (!config.logChannelId) return;
  await channels
    .send(config.logChannelId, makeErrorCard(title, body))
    .catch(() => null);
}

async function ban(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const guildId = ctx.guildId!;
  const number = await ctx.getInteger("number");
  if (number === null) return ctx.replyError("Error", "Provide a confession number.");
  const meta = await getConfession(guildId, number);
  if (!meta) return ctx.replyError("Error", `Confession #${number} was not found.`);

  await banHash(guildId, meta.authorHash, ctx.user.id);
  await log(
    guildId,
    "Author Banned",
    `The author of **Confession #${number}** was banned by <@${ctx.user.id}>.`,
  );
  return ctx.replySuccess(
    "Author Banned",
    `The anonymous author of **Confession #${number}** can no longer submit or reply.`,
  );
}

async function unban(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const guildId = ctx.guildId!;
  const target = ((await ctx.getString("target")) ?? "").trim();

  let hash: string;
  if (/^\d+$/.test(target)) {
    const meta = await getConfession(guildId, Number(target));
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

  const removed = await unbanHash(guildId, hash);
  if (removed === 0) return ctx.replyError("Error", "That author was not banned.");

  await log(guildId, "Author Unbanned", `An author was unbanned by <@${ctx.user.id}>.`);
  return ctx.replySuccess("Unbanned", "The author can participate again.");
}

async function list(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const bans = await listBans(ctx.guildId!);
  if (bans.length === 0) {
    return ctx.reply(makeListCard("Banned Authors", ["No authors are currently banned."]));
  }
  const lines = bans.map(
    (b) => `\`${b.hash.slice(0, 16)}…\` — ${relative(b.record.at)} by <@${b.record.by}>`,
  );
  return ctx.reply(makeListCard("Banned Authors", lines));
}

async function removeConfession(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("mod.*");
  const guildId = ctx.guildId!;
  const number = await ctx.getInteger("number");
  if (number === null) return ctx.replyError("Error", "Provide a confession number.");
  const reason = (await ctx.getString("reason")) ?? "No reason given";
  const meta = await getConfession(guildId, number);
  if (!meta) return ctx.replyError("Error", `Confession #${number} was not found.`);

  const config = await getConfessionsConfig(guildId);
  if (config.channelId && meta.messageId) {
    await messages.remove(config.channelId, meta.messageId).catch(() => null);
  }
  if (meta.threadId) {
    await threads.remove(meta.threadId).catch(() => null);
  }
  await deleteConfession(guildId, number);

  await log(
    guildId,
    "Confession Deleted",
    `**Confession #${number}** was deleted by <@${ctx.user.id}>.\nReason: ${reason}`,
  );
  return ctx.replySuccess("Deleted", `Confession #${number} was removed.`);
}

export default defineCommand({
  name: "confessmod",
  description: "Moderate anonymous confessions (identity is never revealed).",
  build: () => ({
    name: "confessmod",
    description: "Moderate anonymous confessions (identity is never revealed).",
    options: [
      {
        type: 1,
        name: "ban",
        description: "Ban a confession's anonymous author by number.",
        options: [
          { type: 4, name: "number", description: "The confession number.", required: true, min_value: 1 },
        ],
      },
      {
        type: 1,
        name: "unban",
        description: "Unban by confession number or author hash.",
        options: [
          { type: 3, name: "target", description: "A confession number or a 64-char author hash.", required: true },
        ],
      },
      { type: 1, name: "list", description: "List banned author hashes." },
      {
        type: 1,
        name: "delete",
        description: "Delete a confession by number.",
        options: [
          { type: 4, name: "number", description: "The confession number.", required: true, min_value: 1 },
          { type: 3, name: "reason", description: "Logged reason (optional).", required: false },
        ],
      },
    ],
  }),
  run: async (ctx: CommandContext) => {
    if (!ctx.guildId) {
      return ctx.replyError("Guild Only", "This command only works inside a server.");
    }
    return ctx.replyError(
      "Error",
      "Use a subcommand: `ban`, `unban`, `list`, or `delete`.",
    );
  },
  handlers: { ban, unban, list, delete: removeConfession },
});
