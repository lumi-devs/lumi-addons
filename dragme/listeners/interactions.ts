import type {
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type ButtonInteraction,
  ChannelType,
  channelMention,
  type Interaction,
  PermissionFlagsBits,
} from "discord.js";
import {
  claimPendingRequest,
  getPendingRequest,
  ModuleName,
} from "../data.js";
import {
  acceptedCard,
  cancelledCard,
  declinedCard,
  editRequestCard,
  expiredCard,
  failedCard,
} from "../ui.js";

export const interactionsListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(`${ModuleName}:`)) return;
    if (!interaction.inCachedGuild()) return;
    if (!services.modules.isEnabled(interaction.guildId, ModuleName)) return;
    await handleButton(interaction, services);
  },
};

async function handleButton(
  interaction: ButtonInteraction<"cached">,
  services: ModuleServices,
): Promise<void> {
  const [prefix, action, requesterId, requestId] =
    interaction.customId.split(":");
  if (prefix !== ModuleName || !requesterId || !requestId) return;
  if (action !== "accept" && action !== "decline" && action !== "cancel") {
    return;
  }

  const guild = interaction.guild;
  const request = await getPendingRequest(services, guild.id, requesterId);
  if (!request || request.requestId !== requestId) {
    await replyError(
      interaction,
      "Request Gone",
      "This drag request is no longer active.",
    );
    return;
  }

  if (action === "cancel") {
    if (interaction.user.id !== requesterId) {
      await replyError(
        interaction,
        "Not Your Request",
        "Only the requester can cancel this drag request.",
      );
      return;
    }
    const claimed = await claimPendingRequest(
      services,
      guild.id,
      requesterId,
      requestId,
    );
    if (!claimed) {
      await replyError(
        interaction,
        "Request Gone",
        "This drag request is no longer active.",
      );
      return;
    }
    await interaction.deferUpdate();
    await editRequestCard(services, claimed, cancelledCard(claimed));
    return;
  }

  if (request.expiresAt <= Date.now()) {
    await replyError(
      interaction,
      "Request Expired",
      "This drag request has expired.",
    );
    const claimed = await claimPendingRequest(
      services,
      guild.id,
      requesterId,
      requestId,
    );
    if (claimed) await editRequestCard(services, claimed, expiredCard(claimed));
    return;
  }

  const channel = await guild.channels
    .fetch(request.channelId)
    .catch(() => null);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildStageVoice)
  ) {
    await claimPendingRequest(services, guild.id, requesterId, requestId);
    await replyError(
      interaction,
      "Channel Gone",
      "The destination voice channel no longer exists.",
    );
    return;
  }

  if (!channel.members.has(interaction.user.id)) {
    await replyError(
      interaction,
      "Not Your Call",
      `Only members currently in ${channelMention(channel.id)} can respond to this request.`,
    );
    return;
  }

  const botMember = guild.members.me;
  const permissions = botMember ? channel.permissionsFor(botMember) : null;
  if (
    !permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.MoveMembers,
    ])
  ) {
    await replyError(
      interaction,
      "Missing Permissions",
      `I need View Channel, Connect, and Move Members in ${channelMention(channel.id)}.`,
    );
    return;
  }

  const claimed = await claimPendingRequest(
    services,
    guild.id,
    requesterId,
    requestId,
  );
  if (!claimed) {
    await replyError(
      interaction,
      "Request Gone",
      "This drag request is no longer active.",
    );
    return;
  }

  await interaction.deferUpdate();

  if (action === "decline") {
    await editRequestCard(
      services,
      claimed,
      declinedCard(claimed, interaction.user.id),
    );
    return;
  }

  const requester = await guild.members
    .fetch(claimed.requesterId)
    .catch(() => null);
  if (!requester?.voice.channelId) {
    await editRequestCard(services, claimed, failedCard(claimed));
    return;
  }

  let moved = true;
  try {
    await requester.voice.setChannel(channel);
  } catch {
    moved = false;
  }

  await editRequestCard(
    services,
    claimed,
    moved ? acceptedCard(claimed, interaction.user.id) : failedCard(claimed),
  );
}

async function replyError(
  interaction: ButtonInteraction<"cached">,
  title: string,
  body: string,
): Promise<void> {
  await interaction
    .reply(ephemeralCard(makeErrorCard(title, body)))
    .catch(() => undefined);
}
