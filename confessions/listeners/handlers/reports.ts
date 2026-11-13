import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import type { ButtonInteraction } from "discord.js";
import { readConfig } from "../../config.js";
import {
  claimReport,
  confessionReportKey,
  getConfession,
  getReply,
  isReported,
  markReported,
  releaseReportClaim,
  replyReportKey,
} from "../../data.js";
import { deferEphemeral, replyEphemeral, requireGuild } from "../helpers.js";

async function submitReport(
  interaction: ButtonInteraction,
  services: ModuleServices,
  options: {
    guildId: string;
    reportChannelId: string;
    pingRoleId: string | null;
    key: string;
    title: string;
    lines: string[];
    alreadyReported: string;
  },
): Promise<void> {
  if (await isReported(services, options.guildId, options.key)) {
    await replyEphemeral(
      interaction,
      makeWarningCard("Already Reported", options.alreadyReported),
    );
    return;
  }

  if (!(await claimReport(services, options.guildId, options.key))) {
    await replyEphemeral(
      interaction,
      makeWarningCard("Already Reported", options.alreadyReported),
    );
    return;
  }

  await deferEphemeral(interaction);

  const channel = await services.client.channels
    .fetch(options.reportChannelId)
    .catch(() => null);
  if (!channel?.isSendable()) {
    await releaseReportClaim(services, options.guildId, options.key);
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Channel Unavailable",
        "The report channel is missing or I cannot send messages there.",
      ),
    );
    return;
  }

  const lines = options.pingRoleId
    ? [`<@&${options.pingRoleId}>`, ...options.lines]
    : options.lines;

  try {
    await channel.send(cardCreateOptions(makeWarningCard(options.title, lines)));
  } catch (error) {
    services.observability?.logger?.warn?.("confession report failed", {
      guildId: options.guildId,
      error,
    });
    await releaseReportClaim(services, options.guildId, options.key);
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Could Not Report",
        "The report could not be delivered. Please try again later.",
      ),
    );
    return;
  }

  await markReported(services, options.guildId, options.key).catch(
    () => undefined,
  );
  await replyEphemeral(
    interaction,
    makeSuccessCard(
      "Report Submitted",
      "Thank you. Moderators have been notified.",
    ),
  );
}

export async function handleReportButton(
  interaction: ButtonInteraction,
  services: ModuleServices,
  number: number,
): Promise<void> {
  const guildId = await requireGuild(interaction, services);
  if (!guildId) return;

  const config = await readConfig(services, guildId);
  if (!config.reportChannelId) {
    await replyEphemeral(
      interaction,
      makeWarningCard(
        "Not Configured",
        "Reporting is not configured in this server.",
      ),
    );
    return;
  }

  const record = await getConfession(services, guildId, number);
  if (!record) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Not Found",
        `Confession #${number} no longer exists in this server.`,
      ),
    );
    return;
  }

  const jumpUrl = `https://discord.com/channels/${guildId}/${record.index.channelId}/${record.index.messageId}`;
  await submitReport(interaction, services, {
    guildId,
    reportChannelId: config.reportChannelId,
    pingRoleId: config.reportPingRoleId,
    key: confessionReportKey(number),
    title: `🚨 Confession Report #${record.meta.number}`,
    lines: [
      `**Reporter:** <@${interaction.user.id}> (${interaction.user.id})`,
      `**Confession:** #${record.meta.number}`,
      `**Channel:** <#${record.index.channelId}>`,
      `[Jump to message](${jumpUrl})`,
    ],
    alreadyReported:
      "Moderators have already been notified about this confession.",
  });
}

export async function handleReportReply(
  interaction: ButtonInteraction,
  services: ModuleServices,
  number: number,
  path: string,
): Promise<void> {
  const guildId = await requireGuild(interaction, services);
  if (!guildId) return;

  const config = await readConfig(services, guildId);
  if (!config.reportChannelId) {
    await replyEphemeral(
      interaction,
      makeWarningCard(
        "Not Configured",
        "Reporting is not configured in this server.",
      ),
    );
    return;
  }

  const reply = await getReply(services, guildId, path);
  if (!reply) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Not Found",
        `Reply #${path} no longer exists in this server.`,
      ),
    );
    return;
  }

  const jumpUrl = `https://discord.com/channels/${guildId}/${reply.channelId}/${reply.messageId}`;
  await submitReport(interaction, services, {
    guildId,
    reportChannelId: config.reportChannelId,
    pingRoleId: config.reportPingRoleId,
    key: replyReportKey(path),
    title: `🚨 Reply Report #${path}`,
    lines: [
      `**Reporter:** <@${interaction.user.id}> (${interaction.user.id})`,
      `**Author Hash:** \`${reply.authorHash}\``,
      `**Confession:** #${number}`,
      `**Reply:** #${path}`,
      `**Content:** ${reply.text}`,
      `[Jump to message](${jumpUrl})`,
    ],
    alreadyReported:
      "Moderators have already been notified about this reply.",
  });
}
