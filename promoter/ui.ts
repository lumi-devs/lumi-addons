import {
  createActionButton,
  formatTimestamp,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  noPingCard,
  row,
  type CardReply,
} from "@lumi/ui";
import {
  ModuleName,
  type GrantedRecord,
  type PromoterConfig,
  type PromoterStats,
} from "./data.js";

function activeTerms(config: PromoterConfig): string[] {
  return config.matchTerms
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function requirements(config: PromoterConfig): string[] {
  const terms = activeTerms(config);
  const lines: string[] = [];
  if (terms.length > 0) {
    lines.push(`**Custom status**\nUse any of: ${terms.map((term) => `\`${term}\``).join(", ")}`);
  }
  if (config.detectServerTag) {
    lines.push("**Server tag**\nWear this server's tag next to your name.");
  }
  if (lines.length === 0) {
    lines.push("No promoter signals are enabled yet.");
  }
  return lines;
}

export function panelCard(config: PromoterConfig, guildName: string): CardReply {
  const lines: string[] = [];
  if (config.promoterRoleId) {
    lines.push(
      `Advertise **${guildName}** to earn <@&${config.promoterRoleId}>.`,
    );
  } else {
    lines.push("The promoter role has not been configured yet.");
  }
  lines.push("**How to qualify**", ...requirements(config));
  lines.push("Press the button below to check your current status.");

  return noPingCard(
    makeInfoCard("📣 Promoter", lines, {
      actionRows: [
        row(
          createActionButton({
            customId: `${ModuleName}:check`,
            label: "Check my status",
            emoji: "🔍",
          }),
        ),
      ],
    }),
  );
}

export function statsCard(stats: PromoterStats): CardReply {
  return makeInfoCard("📣 Promoter Stats", [
    `**All-time grants**\n${stats.grants}`,
    `**All-time revokes**\n${stats.revokes}`,
  ]);
}

export function grantedCard(reason: string): CardReply {
  return makeSuccessCard("Promoter Role Granted", [
    "Thanks for advertising the server!",
    `**Signal**\n${reason}`,
  ]);
}

export function holdingCard(record: GrantedRecord): CardReply {
  return makeInfoCard("Already Promoting", [
    `Your promoter role was granted for **${record.reason}**.`,
    `**Since**\n${formatTimestamp(record.grantedAt, "R")}`,
  ]);
}

export function revokedCard(): CardReply {
  return makeWarningCard(
    "Promoter Role Removed",
    "Your status no longer advertises the server, so the promoter role was removed.",
  );
}

export function notEligibleCard(config: PromoterConfig): CardReply {
  return makeInfoCard("Not Eligible Yet", [
    "Your current status does not advertise this server.",
    ...requirements(config),
  ]);
}

export function unreadableCard(): CardReply {
  return makeWarningCard(
    "Status Unavailable",
    "You appear offline, so your custom status cannot be read. Your promoter role was left unchanged.",
  );
}

export function unmanagedCard(config: PromoterConfig): CardReply {
  return makeInfoCard("Role Already Present", [
    config.promoterRoleId
      ? `You already have <@&${config.promoterRoleId}>, but this module did not grant it, so it will not remove it.`
      : "You already have the promoter role, but this module did not grant it.",
  ]);
}

export function notManageableCard(): CardReply {
  return makeErrorCard(
    "Role Unavailable",
    "The bot cannot manage the promoter role. Ask an admin to check **Manage Roles** and the role position.",
  );
}

export function unconfiguredCard(): CardReply {
  return makeErrorCard(
    "Not Configured",
    "Ask an admin to set the promoter role in the module settings.",
  );
}

export function logGrantCard(
  userId: string,
  reason: string,
  avatarUrl: string | null,
): CardReply {
  return noPingCard(
    makeInfoCard(
      "📣 Promoter Role Granted",
      [`<@${userId}> is now promoting the server.`, `**Signal**\n${reason}`],
      avatarUrl ? { thumbnailUrl: avatarUrl } : undefined,
    ),
  );
}

export function logRevokeCard(
  userId: string,
  reason: string,
  avatarUrl: string | null,
): CardReply {
  return noPingCard(
    makeInfoCard(
      "📣 Promoter Role Removed",
      [
        `<@${userId}> stopped promoting the server.`,
        `**Previous signal**\n${reason}`,
      ],
      avatarUrl ? { thumbnailUrl: avatarUrl } : undefined,
    ),
  );
}
