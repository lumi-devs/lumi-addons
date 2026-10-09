import type { InteractionContext } from "lumi/interactions";
import { deferUpdate } from "lumi/interactions";
import { guilds, members, messages, voiceChannels } from "lumi/discord";
import {
  channelMention,
  disabledRequestPayload,
  userMention,
} from "../lib/cards.js";
import {
  getRequest,
  setRequest,
} from "../lib/requests.js";

export default {
  prefix: "dragme:",
  run: async (ctx: InteractionContext) => {
    const [, verb, requestId] = ctx.customId.split(":");
    if ((verb !== "acc" && verb !== "dec") || !requestId || !ctx.guildId) return;

    const req = await getRequest(ctx.guildId, requestId);
    if (!req || req.status !== "pending" || req.expiresAt <= Date.now()) {
      return ctx.replyError("Gone", "This drag request is no longer active.");
    }

    const occupants = await voiceChannels.members(req.channelId).catch((): null => null);
    if (!occupants) {
      return ctx.replyError("Gone", "That voice channel no longer exists.");
    }
    if (!occupants.includes(ctx.user.id)) {
      return ctx.replyError(
        "Not Your Call",
        `Only members currently in ${channelMention(req.channelId)} can respond to this request.`,
      );
    }

    req.status = verb === "acc" ? "accepted" : "declined";
    await Promise.all([
      setRequest(req),
      setRequest({ ...req, requestId: req.requesterId }),
    ]);

    await deferUpdate();

    if (verb === "dec") {
      await messages
        .edit(
          req.cardChannelId,
          req.cardMessageId,
          disabledRequestPayload(
            req,
            "Drag Request Declined",
            `${userMention(ctx.user.id)} declined ${userMention(req.requesterId)}'s request to join ${channelMention(req.channelId)}.`,
            "warning",
          ),
        )
        .catch(() => null);
      return;
    }

    const requester = await guilds.fetchMember(ctx.guildId, req.requesterId);
    if (!requester) {
      await messages
        .edit(
          req.cardChannelId,
          req.cardMessageId,
          disabledRequestPayload(
            req,
            "Member Left",
            "The requester is no longer in this server.",
            "error",
          ),
        )
        .catch(() => null);
      return;
    }

    try {
      await members.move(ctx.guildId, req.requesterId, req.channelId);
    } catch {
      await messages
        .edit(
          req.cardChannelId,
          req.cardMessageId,
          disabledRequestPayload(
            req,
            "Drag Failed",
            `${userMention(req.requesterId)} couldn't be moved into ${channelMention(req.channelId)} — they may have left voice.`,
            "error",
          ),
        )
        .catch(() => null);
      return;
    }

    await messages
      .edit(
        req.cardChannelId,
        req.cardMessageId,
        disabledRequestPayload(
          req,
          "Drag Request Accepted",
          `${userMention(ctx.user.id)} dragged ${userMention(req.requesterId)} into ${channelMention(req.channelId)}.`,
          "success",
        ),
      )
      .catch(() => null);
  },
};
