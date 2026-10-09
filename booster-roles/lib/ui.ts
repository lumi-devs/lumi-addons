import {
  BrandColors,
  actionRow,
  makeCard,
  makeInfoCard,
  modal,
  resolveCardColor,
  selectRow,
  type CardReply,
} from "lumi/ui";
import { parseHexColor } from "./engine.js";
import type { BoosterRole } from "./data.js";

export const IDS = {
  create: "booster-roles:role:create",
  rename: "booster-roles:role:rename",
  recolor: "booster-roles:role:recolor",
  share: "booster-roles:role:share",
  shares: "booster-roles:role:shares",
  delete: "booster-roles:role:delete",
  deleteConfirm: "booster-roles:role:delete:confirm",
  nameModalCreate: "booster-roles:modal:name:create",
  nameModalRename: "booster-roles:modal:name:rename",
  colorModal: "booster-roles:modal:color",
  shareModal: "booster-roles:modal:share",
  unshareSelect: "booster-roles:select:unshare",
} as const;

export const PREFIX_BUTTONS = "booster-roles:role:";
export const PREFIX_MODALS = "booster-roles:modal:";
export const PREFIX_SELECTS = "booster-roles:select:";

export function buildPanel(record: BoosterRole | null): CardReply {
  if (!record) {
    return makeInfoCard(
      "🎨 Your Booster Role",
      "You don't have a custom role yet. As a booster, you can create one with your own name and colour — and share it with a few friends.",
      {
        footer: "Thanks for boosting!",
        actionRows: [
          actionRow([
            { customId: IDS.create, label: "Create My Role", style: 3, emoji: "✨" },
          ]),
        ],
      },
    );
  }

  const hex = record.color ?? "*default*";
  const body = [
    `**Role:** <@&${record.roleId}>`,
    `**Colour:** \`${hex}\``,
    ...(record.icon ? [`**Icon:** ${record.icon}`] : []),
    `**Shared with:** ${
      record.sharedWith.length
        ? record.sharedWith.map((id) => `<@${id}>`).join(", ")
        : "*no one*"
    }`,
  ].join("\n");

  const accent = record.color ? parseHexColor(record.color) ?? undefined : undefined;
  return makeCard(
    accent ?? resolveCardColor("primary") ?? BrandColors.primary,
    "🎨 Your Booster Role",
    body,
    {
      actionRows: [
        actionRow([
          { customId: IDS.rename, label: "Rename", style: 2, emoji: "✏️" },
          { customId: IDS.recolor, label: "Recolour", style: 2, emoji: "🎨" },
          { customId: IDS.share, label: "Share", style: 2, emoji: "🤝" },
          {
            customId: IDS.shares,
            label: "Manage Shares",
            style: 2,
            emoji: "👥",
            disabled: record.sharedWith.length === 0,
          },
          { customId: IDS.delete, label: "Delete", style: 4, emoji: "🗑️" },
        ]),
      ],
    },
  );
}

export function buildNameModal(mode: "create" | "rename", maxLength: number, current?: string) {
  return modal({
    title: mode === "create" ? "Create Your Role" : "Rename Your Role",
    customId: mode === "create" ? IDS.nameModalCreate : IDS.nameModalRename,
    fields: [
      {
        customId: "name",
        label: "Role name",
        placeholder: "e.g. Stardust",
        maxLength,
        ...(current ? { value: current } : {}),
      },
    ],
  });
}

export function buildColorModal(current?: string) {
  return modal({
    title: "Recolour Your Role",
    customId: IDS.colorModal,
    fields: [
      {
        customId: "color",
        label: "Hex colour",
        placeholder: "#5865F2",
        maxLength: 9,
        ...(current ? { value: current } : {}),
      },
    ],
  });
}

export function buildShareModal() {
  return modal({
    title: "Share Your Role",
    customId: IDS.shareModal,
    fields: [
      {
        customId: "user",
        label: "Member",
        placeholder: "@mention or user ID",
      },
    ],
  });
}

export function buildUnsharePrompt(ids: string[]): CardReply {
  return makeInfoCard(
    "👥 Manage Shares",
    "Remove the role from a member you've shared it with.",
    {
      actionRows: [
        selectRow({
          customId: IDS.unshareSelect,
          placeholder: "Pick a member to remove",
          options: ids.map((id) => ({ label: id, value: id })),
        }),
      ],
    },
  );
}

export function buildDeleteConfirm(record: BoosterRole): CardReply {
  return makeCard(
    resolveCardColor("warning") || BrandColors.primary,
    "⚠️ Delete Your Role",
    `This permanently deletes <@&${record.roleId}> and removes it from everyone. This can't be undone.`,
    {
      actionRows: [
        actionRow([
          {
            customId: IDS.deleteConfirm,
            label: "Delete Permanently",
            style: 4,
            emoji: "🗑️",
          },
        ]),
      ],
    },
  );
}
