import type { CardReply } from "@lumi/ui";
import {
  createPaginationRow,
  formatPageFooter,
  formatTimestamp,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import { escapeMarkdown } from "discord.js";
import { ModuleName } from "./config.js";

export const StatsPageSize = 10;

export function roleText(roleId: string, roleName?: string | null): string {
  const name = roleName?.trim();
  if (!name) return `\`${roleId}\``;
  return `**${escapeMarkdown(name)}** (\`${roleId}\`)`;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  return parts.join(" ");
}

export interface TopStatsEntry {
  roleId: string;
  roleName: string | null;
  count: number;
}

export interface TopStatsInput {
  guildName: string;
  userId: string;
  page: number;
  entries: readonly TopStatsEntry[];
  totalMentions: number;
}

export function buildTopStatsCard(input: TopStatsInput): CardReply {
  const totalPages = Math.max(
    1,
    Math.ceil(input.entries.length / StatsPageSize),
  );
  const page = Math.min(
    Math.max(0, Math.trunc(input.page)),
    totalPages - 1,
  );
  const start = page * StatsPageSize;
  const slice = input.entries.slice(start, start + StatsPageSize);
  const lines = slice.map(
    (entry, index) =>
      `**#${start + index + 1}** ${roleText(entry.roleId, entry.roleName)} — **${entry.count}**`,
  );
  const actionRows =
    input.entries.length > 0
      ? [
          createPaginationRow({
            customIdPrefix: `${ModuleName}:stats:${input.userId}:top`,
            currentPage: page,
            totalPages,
          }),
        ]
      : [];

  return makeInfoCard(
    "📊 Role Mentions Today",
    lines.length > 0
      ? lines
      : ["No role mentions have been recorded today."],
    {
      subtitle: input.guildName,
      footer: `${formatPageFooter(page, totalPages, input.entries.length)} · ${input.totalMentions} total mention${input.totalMentions === 1 ? "" : "s"} · UTC day`,
      actionRows,
      separatorAboveActionRows: true,
    },
  );
}

export interface RoleStatsInput {
  guildName: string;
  userId: string;
  page: number;
  roleId: string;
  roleName: string | null;
  entries: readonly { day: string; count: number }[];
}

export function buildRoleStatsCard(input: RoleStatsInput): CardReply {
  const totalPages = Math.max(
    1,
    Math.ceil(input.entries.length / StatsPageSize),
  );
  const page = Math.min(
    Math.max(0, Math.trunc(input.page)),
    totalPages - 1,
  );
  const start = page * StatsPageSize;
  const slice = input.entries.slice(start, start + StatsPageSize);
  const total = input.entries.reduce((sum, entry) => sum + entry.count, 0);
  const lines = slice.map((entry) => {
    const timestamp = Date.parse(`${entry.day}T00:00:00Z`);
    const label = Number.isFinite(timestamp)
      ? formatTimestamp(new Date(timestamp), "D")
      : entry.day;
    return `${label} — **${entry.count}** mention${entry.count === 1 ? "" : "s"}`;
  });
  const actionRows =
    input.entries.length > 0
      ? [
          createPaginationRow({
            customIdPrefix: `${ModuleName}:stats:${input.userId}:role:${input.roleId}`,
            currentPage: page,
            totalPages,
          }),
        ]
      : [];

  return makeInfoCard(
    "📊 Role Mention History",
    [
      `**Role**\n${roleText(input.roleId, input.roleName)}`,
      lines.length > 0
        ? lines.join("\n")
        : "No mention data is retained for this role.",
    ],
    {
      subtitle: input.guildName,
      footer: `${formatPageFooter(page, totalPages, input.entries.length)} · ${total} mention${total === 1 ? "" : "s"} · retained 48h`,
      actionRows,
      separatorAboveActionRows: true,
    },
  );
}

export interface BlockLogInput {
  roleId: string;
  roleName: string;
  durationMinutes: number;
  expiresAt: number;
  manual: boolean;
}

export function buildBlockCard(input: BlockLogInput): CardReply {
  return makeWarningCard(
    "🛡️ Role Mentions Blocked",
    [
      `**Role**\n${roleText(input.roleId, input.roleName)}`,
      `**Duration**\n${formatDuration(input.durationMinutes)}`,
      `**Expires**\n${formatTimestamp(new Date(input.expiresAt), "R")}`,
      `**Trigger**\n${input.manual ? "Manual block" : "Automatic protection"}`,
    ],
    {
      footer: "Mentions of this role are suppressed until it is restored.",
    },
  );
}

export interface RestoreLogInput {
  roleId: string;
  roleName: string | null;
  previousMentionable: boolean;
  reason: "expired" | "manual";
}

export function buildRestoreCard(input: RestoreLogInput): CardReply {
  return makeSuccessCard("🔓 Role Mentions Restored", [
    `**Role**\n${roleText(input.roleId, input.roleName)}`,
    `**State**\n${input.previousMentionable ? "Mentionable" : "Not mentionable"}`,
    `**Reason**\n${input.reason === "expired" ? "Block expired" : "Manually unblocked"}`,
  ]);
}

export function buildBlockClearedCard(
  roleId: string,
  roleName: string | null,
): CardReply {
  return makeWarningCard("🧹 Role Block Cleared", [
    `**Role**\n${roleText(roleId, roleName)}`,
    "The role no longer exists, so its mention block record was removed.",
  ]);
}