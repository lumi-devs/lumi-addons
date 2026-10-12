import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { scheduleOneshot } from "@lumi-devs/lumi/scheduler";
import { MODULE_NAME, EXPIRE_ONESHOT, type DragRequestRecord } from "../utilities/Keys.js";
import { channelMention, requestPayload, userMention } from "../utilities/Cards.js";
import { getRequest, setRequest } from "../utilities/Requests.js";

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const dragmeDef: CommandDef = {
  name: "dragme",
  module: MODULE_NAME,
  description: "Ask the people in a voice channel to drag you in.",
  guildOnly: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("dragme")
      .setDescription("Ask the people in a voice channel to drag you in.")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("A user currently in the voice channel you want to join")
          .setRequired(true),
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("The voice channel you want to join")
          .setRequired(true),
      ) as SlashCommandBuilder,
  run: async (ctx: CommandContext) => {
    if (!ctx.guildId) {
      return ctx.replyError("Guild Only", "This command only works inside a server.");
    }

    const [timeoutRaw, channelIdRaw, blacklistRaw] = await Promise.all([
      ctx.services.db.config.getModuleConfig(ctx.guildId, MODULE_NAME, "timeout_minutes"),
      ctx.services.db.config.getModuleConfig(ctx.guildId, MODULE_NAME, "request_channel_id"),
      ctx.services.db.config.getModuleConfig(ctx.guildId, MODULE_NAME, "blacklist_role_ids"),
    ]);

    const cardChannelId = typeof channelIdRaw === "string" ? channelIdRaw : null;
    if (!cardChannelId) {
      return ctx.replyError(
        "Not Set Up",
        "Drag requests aren't configured yet — an admin needs to set the request channel.",
      );
    }

    const blacklistIds: string[] =
      Array.isArray(blacklistRaw)
        ? blacklistRaw.filter((v): v is string => typeof v === "string")
        : [];
    const memberRoles = ctx.member?.roles instanceof Array
      ? ctx.member.roles.map((r) => (typeof r === "string" ? r : r.id))
      : [];
    if (blacklistIds.some((id) => memberRoles.includes(id))) {
      return ctx.replyError("Can't Do That", "You're not allowed to use drag requests.");
    }

    const timeoutMinutes = typeof timeoutRaw === "number" ? timeoutRaw : 5;

    const targetUser = await ctx.getUser("user");
    const targetChannel = await ctx.getChannel("channel");
    if (!targetUser || !targetChannel) {
      return ctx.replyError(
        "Can't Do That",
        "Pick a user and a voice channel using the slash command options.",
      );
    }

    if (targetChannel.type !== 2) {
      return ctx.replyError("Can't Do That", "That isn't a voice channel.");
    }

    const guild = ctx.services.client.guilds.cache.get(ctx.guildId);
    if (!guild) return ctx.replyError("Error", "Could not resolve guild.");

    const voiceChannel = guild.channels.cache.get(targetChannel.id);
    if (!voiceChannel || !voiceChannel.isVoiceBased()) {
      return ctx.replyError("Can't Do That", "That isn't a voice channel I can see.");
    }

    const members = voiceChannel.members;
    if (!members.has(targetUser.id)) {
      return ctx.replyError("Can't Do That", "That user isn't in that voice channel right now.");
    }
    if (members.has(ctx.user.id)) {
      return ctx.replyError(
        "Can't Do That",
        `You're already in ${channelMention(targetChannel.id)}.`,
      );
    }

    const existing = await getRequest(ctx.services, ctx.guildId, ctx.user.id);
    if (existing && existing.status === "pending" && existing.expiresAt > Date.now()) {
      return ctx.replyError("Can't Do That", "You already have a pending drag request.");
    }

    const requestId = randomHex(6);
    const now = Date.now();
    const delayMs = timeoutMinutes * 60_000;
    const req: DragRequestRecord = {
      requestId,
      guildId: ctx.guildId,
      requesterId: ctx.user.id,
      targetUserId: targetUser.id,
      channelId: targetChannel.id,
      cardChannelId,
      cardMessageId: "",
      status: "pending",
      createdAt: now,
      expiresAt: now + delayMs,
    };

    const cardChannel = await ctx.services.client.channels.fetch(cardChannelId);
    if (!cardChannel || !cardChannel.isTextBased() || !("send" in cardChannel)) {
      return ctx.replyError("Error", "The configured request channel is not accessible.");
    }

    const payload = requestPayload(req);
    const sent = await cardChannel.send({
      content: payload.content,
      components: [...payload.components],
      allowedMentions: { parse: [] },
    });
    req.cardMessageId = sent.id;

    await Promise.all([
      setRequest(ctx.services, req, { ttlMs: delayMs + 60_000 }),
      setRequest(ctx.services, { ...req, requestId: ctx.user.id }, { ttlMs: delayMs + 60_000 }),
      scheduleOneshot(
        ctx.services,
        MODULE_NAME,
        EXPIRE_ONESHOT,
        ctx.guildId,
        delayMs,
        { requestId } satisfies import("../utilities/Keys.js").ExpireOneshotData,
      ),
    ]);

    return ctx.replySuccess(
      "Request Posted",
      `Asked the members of ${channelMention(targetChannel.id)} to drag you in. Expires ${userMention(ctx.user.id)} … check ${channelMention(cardChannelId)} for the card.`,
      { ephemeral: false },
    );
  },
};
