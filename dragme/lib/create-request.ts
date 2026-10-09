import { randomBytes } from "node:crypto";
import { channels, guilds, voiceChannels } from "lumi/discord";
import { schedule } from "lumi/scheduling";
import { EXPIRE_TASK, type DragRequestRecord } from "../keys.js";
import { getDragmeConfig } from "./config.js";
import { requestPayload, channelMention } from "./cards.js";
import { getRequest, setRequest } from "./requests.js";

export interface CreateInput {
  guildId: string;
  requesterId: string;
  requesterRoles: string[];
  targetUserId: string;
  targetChannelId: string;
}

export type CreateResult = { ok: true } | { ok: false; reason: string };

export async function createDragRequest(
  input: CreateInput,
): Promise<CreateResult> {
  const { guildId, requesterId, requesterRoles, targetUserId, targetChannelId } = input;
  const cfg = await getDragmeConfig(guildId);

  if (!cfg.requestChannelId) {
    return {
      ok: false,
      reason: "Drag requests aren't set up yet — an admin needs to set the request channel.",
    };
  }
  if (cfg.blacklistRoleIds.some((id) => requesterRoles.includes(id))) {
    return { ok: false, reason: "You're not allowed to use drag requests." };
  }

  const target = await guilds.fetchMember(guildId, targetUserId);
  if (!target) {
    return { ok: false, reason: "Could not find that member in the server." };
  }
  const occupants = await voiceChannels.members(targetChannelId).catch((): null => null);
  if (!occupants) {
    return { ok: false, reason: "That isn't a voice channel I can see." };
  }
  if (!occupants.includes(targetUserId)) {
    return { ok: false, reason: "That user isn't in that voice channel right now." };
  }
  if (occupants.includes(requesterId)) {
    return {
      ok: false,
      reason: `You're already in ${channelMention(targetChannelId)}.`,
    };
  }

  const active = await getRequest(guildId, requesterId);
  if (active && active.status === "pending" && active.expiresAt > Date.now()) {
    return { ok: false, reason: "You already have a pending drag request." };
  }

  const requestId = randomBytes(6).toString("hex");
  const now = Date.now();
  const req: DragRequestRecord = {
    requestId,
    guildId,
    requesterId,
    targetUserId,
    channelId: targetChannelId,
    cardChannelId: cfg.requestChannelId,
    cardMessageId: "",
    status: "pending",
    createdAt: now,
    expiresAt: now + cfg.timeoutMinutes * 60_000,
  };

  const sent = await channels.send(cfg.requestChannelId, requestPayload(req));
  req.cardMessageId = sent.id;

  await Promise.all([
    setRequest(req),
    setRequest({ ...req, requestId: requesterId }),
  ]);

  await schedule(
    EXPIRE_TASK,
    { requestId, guildId },
    { delay: cfg.timeoutMinutes * 60_000 },
  );
  return { ok: true };
}
