import type { CardReply, Row } from "@lumi/ui";
import {
  createPaginationRow,
  formatPageFooter,
  formatTimestamp,
  makeInfoCard,
  row,
} from "@lumi/ui";
import {
  MaxEntries,
  ModuleName,
  type RotationState,
  type StatusEntry,
} from "./data.js";
import { formatDurationSeconds } from "./logic.js";

const PageSize = 10;

export interface ListView {
  entries: readonly StatusEntry[];
  state: RotationState;
  page: number;
  userId: string;
}

function cursorIndex(state: RotationState, count: number): number | null {
  if (count === 0) return null;
  return ((Math.trunc(state.cursor) % count) + count) % count;
}

export function listCard(view: ListView): CardReply {
  const totalPages = Math.max(1, Math.ceil(view.entries.length / PageSize));
  const page = Math.min(
    Math.max(0, Math.trunc(view.page) || 0),
    totalPages - 1,
  );
  const start = page * PageSize;
  const slice = view.entries.slice(start, start + PageSize);
  const next = cursorIndex(view.state, view.entries.length);

  const header = [
    `Rotation **${view.state.enabled ? "enabled" : "disabled"}**`,
    `every **${formatDurationSeconds(view.state.intervalSeconds)}**`,
    `cursor **${next === null ? "0/0" : `${next + 1}/${view.entries.length}`}**`,
  ].join(" · ");

  const lines: string[] = [header];
  if (view.state.enabled) {
    lines.push(
      `Next apply ${formatTimestamp(new Date(view.state.nextAt), "R")}.`,
    );
  } else {
    lines.push("Rotation is paused. Use `/status toggle` to resume.");
  }
  if (
    view.state.lastEntryId !== null &&
    view.entries.some((entry) => entry.id === view.state.lastEntryId)
  ) {
    lines.push(`Last applied: **#${view.state.lastEntryId}**.`);
  }
  lines.push("");

  if (slice.length === 0) {
    lines.push("No statuses yet. Add one with `/status add`.");
  } else {
    for (let index = 0; index < slice.length; index += 1) {
      const entry = slice[index];
      if (!entry) continue;
      const marker = next === start + index ? " · next" : "";
      lines.push(
        `**#${entry.id}** · ${entry.type} · ${entry.presence}${marker}`,
      );
      lines.push(entry.text);
    }
  }

  const actionRows: Row[] = [];
  if (totalPages > 1) {
    const pagination = createPaginationRow({
      customIdPrefix: `${ModuleName}:list:${view.userId}`,
      currentPage: page,
      totalPages,
    });
    actionRows.push(row(...pagination.components));
  }

  return makeInfoCard("Rotating Statuses", lines, {
    statusBadge: {
      status: view.state.enabled ? "enabled" : "disabled",
      label: view.state.enabled ? "ROTATING" : "PAUSED",
    },
    footer: formatPageFooter(
      page,
      totalPages,
      `${view.entries.length}/${MaxEntries} statuses`,
    ),
    actionRows,
  });
}