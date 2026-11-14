import type { CommandDefinition } from "@lumi/module-kit";
import {
  cardCreateOptions,
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "@lumi/ui";
import {
  ChannelType,
  channelMention,
  PermissionFlagsBits,
  SlashCommandBuilder,
  userMention,
} from "discord.js";
import { randomBytes } from "node:crypto";
import { getConfig } from "../config.js";
import {
  deletePendingRequest,
  getPendingRequest,
  type DragRequest,
  ModuleName,
  savePendingRequest,
  SweepGraceMs,
} from "../data.js";
import { requestCard } from "../ui.js";

export const dragmeCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("dragme")
    .setDescription("Ask the people in a voice channel to drag you in.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("A user currently in the voice channel you want to join")
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The voice channel you want to join")
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(true),
    ),
  guildOnly: true,
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Drag requests only work in servers."),
        ),
      );
      return;
    }

    if (!services.modules.isEnabled(guild.id, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "Drag Me is disabled in this server.",
          ),
        ),
      );
      return;
    }

    const fail = async (title: string, body: string) => {
      await interaction.reply(
        ephemeralCard(makeErrorCard(title, body)),
      );
    };

    const config = await getConfig(services, guild.id);
    if (!config.requestChannelId) {
      await fail(
        "Not Set Up",
        "An admin needs to set the request channel before drag requests can be used.",
      );
      return;
    }

    const member =
      guild.members.cache.get(interaction.user.id) ??
      (await guild.members.fetch(interaction.user.id).catch(() => null));
    if (!member) {
      await fail("Error", "Could not resolve your server membership.");
      return;
    }

    if (
      config.blacklistRoleIds.some((roleId) =>
        member.roles.cache.has(roleId),
      )
    ) {
      await fail("Can't Do That", "You are not allowed to use drag requests.");
      return;
    }

    const targetUser = interaction.options.getUser("user", true);
    const channelOption = interaction.options.getChannel("channel", true);

    if (targetUser.id === interaction.user.id) {
      await fail(
        "Can't Do That",
        "Pick someone else who is already in the voice channel.",
      );
      return;
    }

    const channel = await guild.channels
      .fetch(channelOption.id)
      .catch(() => null);
    if (
      !channel ||
      (channel.type !== ChannelType.GuildVoice &&
        channel.type !== ChannelType.GuildStageVoice)
    ) {
      await fail("Can't Do That", "That is not a usable voice channel.");
      return;
    }

    const targetMember = await guild.members
      .fetch(targetUser.id)
      .catch(() => null);
    if (targetMember?.voice.channelId !== channel.id) {
      await fail(
        "Can't Do That",
        `${userMention(targetUser.id)} is not in ${channelMention(channel.id)} right now.`,
      );
      return;
    }

    const botMember =
      guild.members.me ??
      (await guild.members.fetchMe().catch(() => null));
    if (!botMember) {
      await fail("Error", "Could not resolve the bot's server membership.");
      return;
    }

    const voicePermissions = channel.permissionsFor(botMember);
    if (
      !voicePermissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.MoveMembers,
      ])
    ) {
      await fail(
        "Missing Permissions",
        `I need View Channel, Connect, and Move Members in ${channelMention(channel.id)}.`,
      );
      return;
    }
    if (channel.userLimit > 0 && channel.members.size >= channel.userLimit) {
      await fail("Can't Do That", `The destination voice channel ${channelMention(channel.id)} is full.`);
      return;
    }

    if (member.voice.channelId === channel.id) {
      await fail(
        "Can't Do That",
        `You are already in ${channelMention(channel.id)}.`,
      );
      return;
    }

    if (!member.voice.channelId) {
      await fail(
        "Join Voice First",
        "Join a voice channel first so I can move you into the requested channel.",
      );
      return;
    }

    const memberPermissions = channel.permissionsFor(member);
    if (!memberPermissions?.has(PermissionFlagsBits.Connect)) {
      await fail("Missing Permissions", `You need Connect permission in ${channelMention(channel.id)}.`);
      return;
    }

    const existing = await getPendingRequest(
      services,
      guild.id,
      interaction.user.id,
    );
    if (existing) {
      if (existing.expiresAt > Date.now()) {
        await fail(
          "Already Pending",
          "You already have a pending drag request.",
        );
        return;
      }
      await deletePendingRequest(services, guild.id, interaction.user.id);
    }

    const requestChannel = await guild.channels
      .fetch(config.requestChannelId)
      .catch(() => null);
    if (
      !requestChannel?.isTextBased() ||
      !("send" in requestChannel)
    ) {
      await fail(
        "Channel Unavailable",
        "The configured request channel is not accessible.",
      );
      return;
    }

    const requestPermissions = requestChannel.permissionsFor(botMember);
    if (
      !requestPermissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ])
    ) {
      await fail(
        "Missing Permissions",
        `I need View Channel and Send Messages in ${channelMention(requestChannel.id)}.`,
      );
      return;
    }

    const now = Date.now();
    const timeoutMs = config.timeoutMinutes * 60_000;
    const request: DragRequest = {
      requestId: randomBytes(6).toString("hex"),
      guildId: guild.id,
      requesterId: interaction.user.id,
      targetUserId: targetUser.id,
      channelId: channel.id,
      cardChannelId: requestChannel.id,
      cardMessageId: "",
      createdAt: now,
      expiresAt: now + timeoutMs,
    };

    const sent = await requestChannel
      .send(cardCreateOptions(requestCard(request)))
      .catch(() => null);
    if (!sent) {
      await fail(
        "Could Not Post",
        "The request card could not be posted in the configured channel.",
      );
      return;
    }
    request.cardMessageId = sent.id;

    try {
      await savePendingRequest(services, request, timeoutMs + SweepGraceMs);
    } catch (error) {
      services.observability.logger.error("dragme request save failed", {
        guildId: guild.id,
        error,
      });
      await sent.delete().catch(() => undefined);
      await fail("Error", "Could not save your drag request.");
      return;
    }

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard(
          "Request Posted",
          `Asked the members of ${channelMention(channel.id)} to drag you in. The card is in ${channelMention(requestChannel.id)} and expires ${formatExpiry(timeoutMs)}.`,
        ),
      ),
    );
  },
};

function formatExpiry(timeoutMs: number): string {
  const minutes = Math.round(timeoutMs / 60_000);
  return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
