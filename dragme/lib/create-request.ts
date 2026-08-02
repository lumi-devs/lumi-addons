import { container } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import {
  channelMention,
  time,
  TimestampStyles,
  userMention,
} from "@discordjs/formatters";
import { ButtonStyle, type GuildMember } from "discord.js";
import { makeInfoCard } from "#utilities/cards.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { dragmeExpireJobId, type DragRequest } from "../keys.js";
import { getDragmeConfig } from "./config.js";
import { getRequest, setRequest } from "./requests.js";

export type CreateResult = { ok: true } | { ok: false; reason: string };

export function buildRequestButtons(
  guildId: string,
  userId: string,
  disabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dragme:acc:${guildId}:${userId}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`dragme:dec:${guildId}:${userId}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
  ];
}

export async function createDragRequest(
  member: GuildMember,
  targetMember: GuildMember,
): Promise<CreateResult> {
  const { guild } = member;
  const target = targetMember.voice.channel;
  if (!target) {
    return {
      ok: false,
      reason: "That user isn't in a voice channel right now.",
    };
  }

  const cfg = await getDragmeConfig(guild.id);

  if (cfg.blacklistRoleIds.some((id) => member.roles.cache.has(id))) {
    return { ok: false, reason: "You're not allowed to use drag requests." };
  }
  if (member.voice.channelId === target.id) {
    return {
      ok: false,
      reason: `You're already in ${channelMention(target.id)}.`,
    };
  }
  if (target.members.size === 0) {
    return {
      ok: false,
      reason: `${channelMention(target.id)} is empty — nobody can approve you. Just join it.`,
    };
  }
  if (await getRequest(guild.id, member.id)) {
    return { ok: false, reason: "You already have a pending drag request." };
  }

  const expiresAt = Date.now() + cfg.timeoutMinutes * 60_000;
  const card = makeInfoCard(
    "Voice Drag Request",
    `${userMention(member.id)} wants to be dragged into ${channelMention(target.id)}.\n\nAnyone **inside that channel** can accept or decline. Expires ${time(new Date(expiresAt), TimestampStyles.RelativeTime)}.`,
    { actionRows: buildRequestButtons(guild.id, member.id) },
  );

  const message = await target.send({
    ...card,
    content: `${userMention(targetMember.id)}, you have a drag request!`,
    allowedMentions: { users: [targetMember.id] },
  });

  const req: DragRequest = {
    guildId: guild.id,
    userId: member.id,
    targetChannelId: target.id,
    cardChannelId: target.id,
    cardMessageId: message.id,
    createdAt: Date.now(),
    expiresAt,
  };
  await setRequest(req);

  // Expiring a little late (e.g. after downtime) is still correct — the
  // handler no-ops if the request was already resolved — so catchUp stays true.
  await scheduleTask(
    "dragme-expire",
    { guildId: guild.id, userId: member.id },
    {
      repeated: false,
      delay: cfg.timeoutMinutes * 60_000,
      customJobOptions: {
        jobId: dragmeExpireJobId(guild.id, member.id),
        removeOnComplete: true,
        removeOnFail: true,
      },
    },
  );
  container.logger.debug(
    `[Dragme] Request ${member.id} → ${target.id} in guild ${guild.id}`,
  );
  return { ok: true };
}
