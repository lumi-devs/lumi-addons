import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { makeCard, makeInfoCard, type CardReply } from "#src/lib/ui/Cards.js";
import { BrandColors } from "#src/lib/ui/Palette.js";
import { parseHexColor } from "./Engine.js";
import type { BoosterRole } from "./Data.js";
import { InteractionIds } from "./Keys.js";

export function buildPanel(record: BoosterRole | null): CardReply {
  if (!record) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(InteractionIds.CREATE)
        .setLabel("Create My Role")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✨"),
    );

    return makeInfoCard(
      "🎨 Your Booster Role",
      "You don't have a custom role yet. As a booster, you can create one with your own name and colour — and share it with a few friends.",
      {
        footer: "Thanks for boosting!",
        actionRows: [row],
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
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(InteractionIds.RENAME)
      .setLabel("Rename")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✏️"),
    new ButtonBuilder()
      .setCustomId(InteractionIds.RECOLOR)
      .setLabel("Recolour")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🎨"),
    new ButtonBuilder()
      .setCustomId(InteractionIds.SHARE)
      .setLabel("Share")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🤝"),
    new ButtonBuilder()
      .setCustomId(InteractionIds.SHARES)
      .setLabel("Manage Shares")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("👥")
      .setDisabled(record.sharedWith.length === 0),
    new ButtonBuilder()
      .setCustomId(InteractionIds.DELETE)
      .setLabel("Delete")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️"),
  );

  return makeCard(accent ?? BrandColors.primary, "🎨 Your Booster Role", body, {
    actionRows: [row],
  });
}

export function buildNameModal(
  mode: "create" | "rename",
  maxLength: number,
  current?: string,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setTitle(mode === "create" ? "Create Your Role" : "Rename Your Role")
    .setCustomId(
      mode === "create"
        ? InteractionIds.NAME_MODAL_CREATE
        : InteractionIds.NAME_MODAL_RENAME,
    );

  const input = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Role name")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. Stardust")
    .setMaxLength(maxLength)
    .setRequired(true);

  if (current) input.setValue(current);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function buildColorModal(current?: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setTitle("Recolour Your Role")
    .setCustomId(InteractionIds.COLOR_MODAL);

  const input = new TextInputBuilder()
    .setCustomId("color")
    .setLabel("Hex colour")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("#5865F2")
    .setMaxLength(9)
    .setRequired(true);

  if (current) input.setValue(current);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function buildShareModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setTitle("Share Your Role")
    .setCustomId(InteractionIds.SHARE_MODAL);

  const input = new TextInputBuilder()
    .setCustomId("user")
    .setLabel("Member")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("@mention or user ID")
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function buildUnsharePrompt(ids: string[]): CardReply {
  const select = new StringSelectMenuBuilder()
    .setCustomId(InteractionIds.UNSHARE_SELECT)
    .setPlaceholder("Pick a member to remove")
    .addOptions(
      ids.slice(0, 25).map((id) => ({
        label: id,
        value: id,
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  return makeInfoCard(
    "👥 Manage Shares",
    "Remove the role from a member you've shared it with.",
    {
      actionRows: [row],
    },
  );
}

export function buildDeleteConfirm(record: BoosterRole): CardReply {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(InteractionIds.DELETE_CONFIRM)
      .setLabel("Delete Permanently")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️"),
  );

  return makeCard(
    BrandColors.warning,
    "⚠️ Delete Your Role",
    `This permanently deletes <@&${record.roleId}> and removes it from everyone. This can't be undone.`,
    {
      actionRows: [row],
    },
  );
}
