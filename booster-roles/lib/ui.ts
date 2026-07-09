import {
  ActionRowBuilder,
  ButtonBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  UserSelectMenuBuilder,
} from "@discordjs/builders";
import { ButtonStyle, TextInputStyle } from "discord.js";
import { roleMention, userMention } from "@discordjs/formatters";
import { makeInfoCard, makeCard, type CardReply } from "#utilities/cards.js";
import { Colors } from "#utilities/branding.js";
import { colorToHex } from "./engine.js";
import type { RoleRecord } from "../keys.js";

// ── Custom-id constants ──────────────────────────────────────────────────────
export const IDS = {
  create: "br:create",
  rename: "br:rename",
  recolor: "br:recolor",
  share: "br:share",
  shares: "br:shares",
  delete: "br:delete",
  deleteConfirm: "br:delete:confirm",
  nameModal: (mode: "create" | "rename") => `br:namemodal:${mode}`,
  colorModal: "br:colormodal",
  shareSelect: "br:sharesel",
  unshareSelect: "br:unsharesel",
} as const;

// ── Member panel ─────────────────────────────────────────────────────────────

export function buildPanel(record: RoleRecord | null): CardReply {
  if (!record) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(IDS.create)
        .setLabel("Create My Role")
        .setEmoji({ name: "✨" })
        .setStyle(ButtonStyle.Success),
    );
    return makeInfoCard(
      "🎨 Your Booster Role",
      "You don't have a custom role yet. As a booster, you can create one with your own name and colour — and share it with a few friends.",
      { footer: "Thanks for boosting!", actionRows: [row] },
    );
  }

  const body = [
    `**Role:** ${roleMention(record.roleId)}`,
    `**Colour:** \`${colorToHex(record.color)}\``,
    `**Shared with:** ${
      record.sharedWith.length
        ? record.sharedWith.map(userMention).join(", ")
        : "*no one*"
    }`,
  ].join("\n");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.rename)
      .setLabel("Rename")
      .setEmoji({ name: "✏️" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.recolor)
      .setLabel("Recolour")
      .setEmoji({ name: "🎨" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.share)
      .setLabel("Share")
      .setEmoji({ name: "🤝" })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.shares)
      .setLabel("Manage Shares")
      .setEmoji({ name: "👥" })
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(record.sharedWith.length === 0),
    new ButtonBuilder()
      .setCustomId(IDS.delete)
      .setLabel("Delete")
      .setEmoji({ name: "🗑️" })
      .setStyle(ButtonStyle.Danger),
  );

  return makeCard(
    record.color || Colors.PRIMARY,
    "🎨 Your Booster Role",
    body,
    {
      actionRows: [row],
    },
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────

function line(
  id: string,
  label: string,
  required: boolean,
  value?: string,
  placeholder?: string,
  maxLength = 100,
): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(required)
    .setMaxLength(maxLength);
  if (value) input.setValue(value);
  if (placeholder) input.setPlaceholder(placeholder);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}

export function buildNameModal(
  mode: "create" | "rename",
  current?: string,
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(IDS.nameModal(mode))
    .setTitle(mode === "create" ? "Create Your Role" : "Rename Your Role")
    .addComponents(line("name", "Role name", true, current, "e.g. Stardust"));
}

export function buildColorModal(current?: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(IDS.colorModal)
    .setTitle("Recolour Your Role")
    .addComponents(line("color", "Hex colour", true, current, "#5865F2", 9));
}

// ── Share / unshare prompts ──────────────────────────────────────────────────

export function buildSharePrompt(maxShares: number, used: number): CardReply {
  const row = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(IDS.shareSelect)
      .setPlaceholder("Pick a member to share with")
      .setMinValues(1)
      .setMaxValues(1),
  );
  return makeInfoCard(
    "🤝 Share Your Role",
    `Choose someone to grant your role to. (${used}/${maxShares} shares used.)`,
    { actionRows: [row] },
  );
}

export function buildUnsharePrompt(
  options: { value: string; label: string }[],
): CardReply {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(IDS.unshareSelect)
    .setPlaceholder("Pick a member to remove")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      options
        .slice(0, 25)
        .map((o) =>
          new StringSelectMenuOptionBuilder()
            .setValue(o.value)
            .setLabel(o.label),
        ),
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    menu,
  );
  return makeInfoCard(
    "👥 Manage Shares",
    "Remove the role from a member you've shared it with.",
    { actionRows: [row] },
  );
}

// ── Delete confirmation ──────────────────────────────────────────────────────

export function buildDeleteConfirm(record: RoleRecord): CardReply {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.deleteConfirm)
      .setLabel("Delete Permanently")
      .setEmoji({ name: "🗑️" })
      .setStyle(ButtonStyle.Danger),
  );
  return makeCard(
    Colors.WARNING,
    "⚠️ Delete Your Role",
    `This permanently deletes ${roleMention(record.roleId)} and removes it from everyone. This can't be undone.`,
    { actionRows: [row] },
  );
}
