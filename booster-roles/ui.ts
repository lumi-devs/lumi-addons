import {
  type CardReply,
  createActionButton,
  createPaginationRow,
  createStringSelectMenu,
  createUserSelectMenu,
  formatTimestamp,
  makeCard,
  makeEmptyCard,
  makeInfoCard,
  makeWarningCard,
  type Row,
  row,
} from "@lumi/ui";
import {
  ActionRowBuilder,
  ButtonStyle,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Role,
} from "discord.js";
import type { Config } from "./config.js";
import type { ListedBlacklistRecord, RoleRecord } from "./data.js";
import { Ids } from "./ids.js";

export interface SharedRoleView {
  roleId: string;
  ownerId: string;
  name: string;
}

export interface ShareOption {
  label: string;
  value: string;
  description?: string;
}

const BlacklistPageSize = 10;

export function buildCreatePanel(
  userId: string,
  config: Config,
  hasShared = false,
): CardReply {
  const buttons = [
    createActionButton({
      customId: Ids.create(userId),
      label: "Create My Role",
      style: ButtonStyle.Success,
      emoji: "✨",
    }),
  ];
  if (hasShared) {
    buttons.push(
      createActionButton({
        customId: Ids.shared(userId),
        label: "Shared With Me",
        style: ButtonStyle.Secondary,
        emoji: "👥",
      }),
    );
  }
  const actionRow = row(...buttons);

  return makeInfoCard(
    "🎨 Your Booster Role",
    [
      "You don't have a custom role yet.",
      "As a booster, you can create one with your own name and colour.",
      `You can share it with up to **${config.maxShares}** member(s).`,
    ],
    {
      footer: "Thanks for boosting!",
      actionRows: [actionRow],
    },
  );
}

export function buildOwnerPanel(
  record: RoleRecord,
  role: Role,
  config: Config,
): CardReply {
  const shared =
    record.shares.length > 0
      ? record.shares.slice(0, 10).map((id) => `<@${id}>`).join(", ")
      : "*no one*";
  const more =
    record.shares.length > 10
      ? ` and ${record.shares.length - 10} more`
      : "";

  const body = [
    `**Role** <@&${record.roleId}>`,
    `**Colour** \`${role.color === 0 ? "default" : role.hexColor.toUpperCase()}\``,
    `**Shared with** ${shared}${more}`,
    `**Created** ${formatTimestamp(new Date(record.createdAt), "R")}`,
  ];
  if (record.graceUntil !== null) {
    body.push(
      `**Grace ends** ${formatTimestamp(new Date(record.graceUntil), "R")}`,
      "Re-boost or regain a qualifying role before then to keep your role.",
    );
  }

  const shareFull =
    config.maxShares === 0 || record.shares.length >= config.maxShares;
  const actions: Row[] = [
    row(
      createActionButton({
        customId: Ids.rename(record.ownerId),
        label: "Rename",
        style: ButtonStyle.Secondary,
        emoji: "✏️",
      }),
      createActionButton({
        customId: Ids.color(record.ownerId),
        label: "Recolour",
        style: ButtonStyle.Secondary,
        emoji: "🎨",
      }),
      createActionButton({
        customId: Ids.manage(record.ownerId),
        label: "Manage Shares",
        style: ButtonStyle.Secondary,
        emoji: "👥",
        disabled: record.shares.length === 0,
      }),
      createActionButton({
        customId: Ids.delete(record.ownerId),
        label: "Delete",
        style: ButtonStyle.Danger,
        emoji: "🗑️",
      }),
    ),
    row(
      createUserSelectMenu({
        customId: Ids.share(record.ownerId),
        placeholder: shareFull
          ? "Share limit reached"
          : "Share with a member...",
        disabled: shareFull,
      }),
    ),
    row(
      createActionButton({
        customId: Ids.shared(record.ownerId),
        label: "Shared With Me",
        style: ButtonStyle.Secondary,
        emoji: "👥",
      }),
    ),
  ];

  return makeCard(
    role.color === 0 ? undefined : role.color,
    "🎨 Your Booster Role",
    body,
    {
      subtitle: "Your personal booster reward",
      separatorAboveActionRows: true,
      actionRows: actions,
    },
  );
}

export function buildSharedPanel(
  userId: string,
  views: SharedRoleView[],
  showBack = false,
  requestedPage = 0,
): CardReply {
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(views.length / pageSize));
  const page = Math.min(
    Math.max(0, Math.trunc(requestedPage) || 0),
    totalPages - 1,
  );
  const pageViews = views.slice(page * pageSize, (page + 1) * pageSize);
  const lines = pageViews.map(
    (view) =>
      `<@&${view.roleId}> — shared by <@${view.ownerId}> (**${view.name}**)`,
  );

  const selectRow = row(
    createStringSelectMenu({
      customId: Ids.renounce(userId),
      placeholder: "Renounce a shared role...",
      options: pageViews.map((view) => ({
        label: view.name,
        value: view.roleId,
        description: `Shared by ${view.ownerId}`,
      })),
    }),
  );
  const actionRows: Row[] = [];
  if (totalPages > 1) {
    actionRows.push(
      createPaginationRow({
        customIdPrefix: Ids.sharedPage(userId),
        currentPage: page,
        totalPages,
      }),
    );
  }
  actionRows.push(selectRow);
  if (showBack) {
    actionRows.push(
      row(
        createActionButton({
          customId: Ids.panel(userId),
          label: "← Back",
          style: ButtonStyle.Secondary,
        }),
      ),
    );
  }

  return makeCard(undefined, "🎨 Shared Booster Roles", lines, {
    footer: `Renouncing removes the role from yourself only. ${views.length} shared role(s).`,
    actionRows,
  });
}

export function buildManageSharesPanel(
  userId: string,
  options: ShareOption[],
): CardReply {
  const selectRow = row(
    createStringSelectMenu({
      customId: Ids.unshare(userId),
      placeholder: "Pick a member to remove",
      options: options.slice(0, 25),
    }),
  );
  const backRow = row(
    createActionButton({
      customId: Ids.panel(userId),
      label: "← Back",
      style: ButtonStyle.Secondary,
    }),
  );

  return makeInfoCard(
    "👥 Manage Shares",
    "Remove your role from a member you've shared it with.",
    {
      actionRows: [selectRow, backRow],
    },
  );
}

export function buildDeleteConfirmPanel(
  userId: string,
  role: Role,
): CardReply {
  const actionRow = row(
    createActionButton({
      customId: Ids.deleteConfirm(userId),
      label: "Delete Permanently",
      style: ButtonStyle.Danger,
      emoji: "🗑️",
    }),
    createActionButton({
      customId: Ids.deleteCancel(userId),
      label: "Cancel",
      style: ButtonStyle.Secondary,
    }),
  );

  return makeWarningCard(
    "⚠️ Delete Your Role",
    `This permanently deletes <@&${role.id}> and removes it from everyone. This can't be undone.`,
    {
      actionRows: [actionRow],
    },
  );
}

export function buildBlacklistPageCard(
  records: ListedBlacklistRecord[],
  requestedPage: number,
  adminId: string,
): CardReply {
  if (records.length === 0) {
    return makeEmptyCard(
      "🚫 Blacklist",
      "Nobody is blacklisted.",
      "Use `/boosterrole-admin blacklist add` to block a member.",
    );
  }

  const totalPages = Math.max(1, Math.ceil(records.length / BlacklistPageSize));
  const page = Math.min(
    Math.max(0, Math.trunc(requestedPage) || 0),
    totalPages - 1,
  );
  const lines = records
    .slice(page * BlacklistPageSize, (page + 1) * BlacklistPageSize)
    .map(
      ({ userId, record }) =>
        `<@${userId}> — ${formatTimestamp(new Date(record.at), "R")} by <@${record.by}>${
          record.reason ? ` · ${record.reason}` : ""
        }`,
    );

  const actionRows =
    totalPages > 1
      ? [
          createPaginationRow({
            customIdPrefix: Ids.adminBlacklistPage(adminId),
            currentPage: page,
            totalPages,
          }),
        ]
      : [];

  return makeCard(undefined, "🚫 Blacklist", lines, {
    footer: `${records.length} blocked member(s)`,
    actionRows,
  });
}

export function buildNameModal(
  customId: string,
  title: string,
  maxLength: number,
  current?: string,
): ModalBuilder {
  const limit = Math.max(1, Math.min(100, maxLength));
  const input = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Role name")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. Stardust")
    .setMaxLength(limit)
    .setRequired(true);
  if (current) input.setValue(current.slice(0, limit));

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input),
    );
}

export function buildColorModal(
  customId: string,
  current?: string,
): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId("color")
    .setLabel("Hex colour")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("#5865F2")
    .setMaxLength(9)
    .setRequired(true);
  if (current) input.setValue(current.slice(0, 9));

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle("Recolour Your Role")
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(input),
    );
}
