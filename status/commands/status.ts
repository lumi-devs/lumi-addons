import { ApplyOptions } from "@sapphire/decorators";
import type { Subcommand } from "@sapphire/plugin-subcommands";
import type { ChatInputCommandInteraction } from "discord.js";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { Duration, DurationFormatter } from "@sapphire/time-utilities";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";

import { paginateList } from "#utilities/pagination.js";
import type { StatusEntry } from "../keys.js";
import {
  addEntry,
  getEntries,
  getSettings,
  removeEntry,
  saveSettings,
} from "../lib/data.js";
import { applyNextStatus } from "../lib/rotate-handler.js";

const TYPES: StatusEntry["type"][] = [
  "Custom",
  "Playing",
  "Listening",
  "Watching",
  "Competing",
];
const PRESENCES: StatusEntry["presence"][] = ["online", "idle", "dnd"];

@ApplyOptions<BaseSubcommand.Options>({
  name: "status",
  description: "Manage the bot's rotating presence.",
  permissionLevel: PermissionLevel.BOT_OWNER,
  subcommands: [
    { name: "add", chatInputRun: "chatInputAdd" },
    { name: "remove", chatInputRun: "chatInputRemove" },
    { name: "list", chatInputRun: "chatInputList" },
    { name: "interval", chatInputRun: "chatInputInterval" },
    { name: "toggle", chatInputRun: "chatInputToggle" },
    { name: "preview", chatInputRun: "chatInputPreview" },
  ],
})
export class StatusCommand extends BaseSubcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Add a rotating status")
            .addStringOption((o) =>
              o
                .setName("text")
                .setDescription(
                  "Status text; supports {guilds}, {users}, {shard}",
                )
                .setMaxLength(128)
                .setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("type")
                .setDescription("Activity type (default Custom)")
                .addChoices(...TYPES.map((t) => ({ name: t, value: t }))),
            )
            .addStringOption((o) =>
              o
                .setName("presence")
                .setDescription("Online status (default idle)")
                .addChoices(...PRESENCES.map((p) => ({ name: p, value: p }))),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Remove a status by id")
            .addIntegerOption((o) =>
              o
                .setName("id")
                .setDescription("Entry id from /status list")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName("list").setDescription("List all rotating statuses"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("interval")
            .setDescription("Set the rotation interval")
            .addStringOption((o) =>
              o
                .setName("duration")
                .setDescription('e.g. "2m", "1h30m" (minimum 30s)')
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName("toggle").setDescription("Enable/disable rotation"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("preview")
            .setDescription("Apply the next status immediately"),
        ),
    );
  }

  public async chatInputAdd(interaction: ChatInputCommandInteraction) {
    const text = interaction.options.getString("text", true);
    const type = (interaction.options.getString("type") ??
      "Custom") as StatusEntry["type"];
    const presence = (interaction.options.getString("presence") ??
      "idle") as StatusEntry["presence"];

    const entry = await addEntry({
      text,
      type,
      presence,
      addedBy: interaction.user.id,
      addedAt: Date.now(),
    });
    return this.replySuccess(
      interaction,
      "Status Added",
      `**#${entry.id}** — ${type === "Custom" ? "" : `${type} `}${text} *(${presence})*`,
    );
  }

  public async chatInputRemove(interaction: ChatInputCommandInteraction) {
    const id = interaction.options.getInteger("id", true);
    const removed = await removeEntry(id);
    return removed
      ? this.replySuccess(
          interaction,
          "Status Removed",
          `Entry **#${id}** deleted.`,
        )
      : this.replyError(
          interaction,
          "Not Found",
          `No status with id **#${id}** — check \`/status list\`.`,
        );
  }

  public async chatInputList(interaction: ChatInputCommandInteraction) {
    const [entries, settings] = await Promise.all([
      getEntries(),
      getSettings(),
    ]);
    const lines = entries.map(
      (e) =>
        `**#${e.id}** ${e.type === "Custom" ? "" : `${e.type} `}${e.text} *(${e.presence})* — ${userMention(e.addedBy)}, ${time(new Date(e.addedAt), TimestampStyles.RelativeTime)}`,
    );
    const state = settings.enabled ? "enabled" : "disabled";
    const every = new DurationFormatter().format(settings.intervalMs);
    lines.unshift(`Rotation is **${state}**, every **${every}**.`, "");
    await paginateList({
      interactionOrMessage: interaction,
      userId: interaction.user.id,
      title: "Rotating Statuses",
      items: lines,
      perPage: 5,
      ephemeral: true,
    });
  }

  public async chatInputInterval(interaction: ChatInputCommandInteraction) {
    const raw = interaction.options.getString("duration", true);
    const ms = new Duration(raw).offset;
    if (!Number.isFinite(ms) || ms < 30_000) {
      return this.replyError(
        interaction,
        "Invalid Duration",
        "Provide a duration of at least 30 seconds, e.g. `2m` or `1h30m`.",
      );
    }
    const settings = await getSettings();
    await saveSettings({ ...settings, intervalMs: ms });
    return this.replySuccess(
      interaction,
      "Interval Updated",
      `Statuses now rotate every **${new DurationFormatter().format(ms)}**.`,
    );
  }

  public async chatInputToggle(interaction: ChatInputCommandInteraction) {
    const settings = await getSettings();
    const enabled = !settings.enabled;
    await saveSettings({ ...settings, enabled });
    return this.replySuccess(
      interaction,
      enabled ? "Rotation Enabled" : "Rotation Disabled",
      enabled
        ? "The presence will rotate on the configured interval."
        : "The presence is frozen until re-enabled.",
    );
  }

  public async chatInputPreview(interaction: ChatInputCommandInteraction) {
    const applied = await applyNextStatus(true);
    return applied
      ? this.replySuccess(
          interaction,
          "Status Applied",
          `Now showing **#${applied.id}** — ${applied.text}`,
        )
      : this.replyError(
          interaction,
          "Nothing to Apply",
          "Add at least one status with `/status add` first.",
        );
  }
}
