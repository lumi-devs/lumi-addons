import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { makeInfoCard } from "@lumi-devs/lumi/ui";
import {
  MIN_INTERVAL_MS,
  MODULE_NAME,
  type StatusEntry,
} from "../utilities/Keys.js";
import {
  addEntry,
  getEntries,
  getState,
  removeEntry,
  saveState,
} from "../utilities/Data.js";
import { formatDurationMs, parseDurationMs } from "../utilities/Duration.js";
import { ensureScheduled, nudgeGuild } from "../tasks/RotateFire.js";

const TYPES: StatusEntry["type"][] = [
  "Custom",
  "Playing",
  "Listening",
  "Watching",
  "Competing",
];
const PRESENCES: StatusEntry["presence"][] = ["online", "idle", "dnd"];

const TYPE_CHOICES = TYPES.map((t) => ({ name: t, value: t }));
const PRESENCE_CHOICES = PRESENCES.map((p) => ({ name: p, value: p }));

function formatEntry(e: StatusEntry): string {
  const kind = e.type === "Custom" ? "" : `${e.type} `;
  return `**#${e.id}** ${kind}${e.text} *(${e.presence})* - <@${e.addedBy}>, <t:${Math.floor(e.addedAt / 1000)}:R>`;
}

async function add(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) return;
  const text = ((await ctx.getString("text", { rest: true })) ?? "").trim();
  if (!text) {
    await ctx.replyError(
      "Missing Text",
      "Provide status text, e.g. `status add Hello world`. Placeholders: {guilds}, {users}.",
    );
    return;
  }
  if (text.length > 128) {
    await ctx.replyError(
      "Too Long",
      "Status text must be 128 characters or fewer.",
    );
    return;
  }

  const rawType = (await ctx.getString("type")) ?? "Custom";
  const type =
    TYPES.find((t) => t.toLowerCase() === rawType.toLowerCase()) ?? null;
  if (!type) {
    await ctx.replyError(
      "Invalid Type",
      `Activity type must be one of: \`${TYPES.join("`, `")}\`.`,
    );
    return;
  }

  const rawPresence = (await ctx.getString("presence")) ?? "idle";
  const presence =
    PRESENCES.find((p) => p.toLowerCase() === rawPresence.toLowerCase()) ??
    null;
  if (!presence) {
    await ctx.replyError(
      "Invalid Presence",
      `Online status must be one of: \`${PRESENCES.join("`, `")}\`.`,
    );
    return;
  }

  const entry = await addEntry(ctx.services, guildId, {
    text,
    type,
    presence,
    addedBy: ctx.user.id,
    addedAt: Date.now(),
  });
  await nudgeGuild(ctx.services, guildId).catch(() => undefined);
  await ctx.replySuccess(
    "Status Added",
    `**#${entry.id}** - ${type === "Custom" ? "" : `${type} `}${text} *(${presence})*`,
  );
}

async function remove(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) return;
  const id = await ctx.getInteger("id");
  if (id === null) {
    await ctx.replyError(
      "Missing ID",
      "Provide the entry id, e.g. `status remove 3`. See `status list`.",
    );
    return;
  }
  const removed = await removeEntry(ctx.services, guildId, id);
  if (removed) {
    await ensureScheduled(ctx.services, guildId).catch(() => undefined);
    await ctx.replySuccess("Status Removed", `Entry **#${id}** deleted.`);
  } else {
    await ctx.replyError(
      "Not Found",
      `No status with id **#${id}** - check \`status list\`.`,
    );
  }
}

async function list(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) return;
  const [entries, state] = await Promise.all([
    getEntries(ctx.services, guildId),
    getState(ctx.services, guildId),
  ]);
  const onOff = state.enabled ? "enabled" : "disabled";
  const every = formatDurationMs(state.intervalMs);
  const nextIn = formatDurationMs(Math.max(0, state.nextAtMs - Date.now()));
  const header = `Rotation is **${onOff}**, every **${every}**, next in **${nextIn}**.`;
  if (entries.length === 0) {
    await ctx.reply(makeInfoCard("Rotating Statuses", header));
    return;
  }
  const shown = entries.slice(0, 20).map(formatEntry);
  if (entries.length > shown.length) {
    shown.push(`...and ${entries.length - shown.length} more.`);
  }
  await ctx.reply(
    makeInfoCard("Rotating Statuses", [header, "", ...shown].join("\n")),
  );
}

async function interval(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) return;
  const raw = ((await ctx.getString("duration")) ?? "").trim();
  const ms = raw ? parseDurationMs(raw) : null;
  if (ms === null || !Number.isFinite(ms) || ms < MIN_INTERVAL_MS) {
    await ctx.replyError(
      "Invalid Duration",
      "Provide a duration of at least 30 seconds, e.g. `2m` or `1h30m`.",
    );
    return;
  }
  const state = await getState(ctx.services, guildId);
  await saveState(ctx.services, guildId, {
    ...state,
    intervalMs: ms,
    nextAtMs: Date.now() + ms,
  });
  await ensureScheduled(ctx.services, guildId).catch(() => undefined);
  await ctx.replySuccess(
    "Interval Updated",
    `Statuses now rotate every **${formatDurationMs(ms)}**.`,
  );
}

async function toggle(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) return;
  const state = await getState(ctx.services, guildId);
  const enabled = !state.enabled;
  await saveState(ctx.services, guildId, { ...state, enabled });
  await ensureScheduled(ctx.services, guildId).catch(() => undefined);
  await ctx.replySuccess(
    enabled ? "Rotation Enabled" : "Rotation Disabled",
    enabled
      ? "The presence will rotate on the configured interval."
      : "The presence is frozen until re-enabled.",
  );
}

async function preview(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) return;
  const state = await getState(ctx.services, guildId);
  await saveState(ctx.services, guildId, { ...state, nextAtMs: 0 });
  const applied = await nudgeGuild(ctx.services, guildId);
  if (applied) {
    await ctx.replySuccess(
      "Status Applied",
      `Now showing **#${applied.id}** - ${applied.text}`,
    );
  } else {
    await ctx.replyError(
      "Nothing to Apply",
      "Add entries with `status add` and enable rotation with `status toggle`.",
    );
  }
}

export const statusDef: CommandDef = {
  name: "status",
  module: MODULE_NAME,
  description: "Manage the bot's rotating presence.",
  guildOnly: true,
  requiredPermit: "admin.status",
  build: () =>
    new SlashCommandBuilder()
      .setName("status")
      .setDescription("Manage the bot's rotating presence.")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a rotating status")
          .addStringOption((opt) =>
            opt
              .setName("text")
              .setDescription("Status text; supports {guilds}, {users}")
              .setRequired(true)
              .setMaxLength(128),
          )
          .addStringOption((opt) =>
            opt
              .setName("type")
              .setDescription("Activity type (default Custom)")
              .setRequired(false)
              .addChoices(...TYPE_CHOICES),
          )
          .addStringOption((opt) =>
            opt
              .setName("presence")
              .setDescription("Online status (default idle)")
              .setRequired(false)
              .addChoices(...PRESENCE_CHOICES),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a status by id")
          .addIntegerOption((opt) =>
            opt
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
          .addStringOption((opt) =>
            opt
              .setName("duration")
              .setDescription("e.g. 2m, 1h30m (minimum 30s)")
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
  handlers: {
    add,
    remove,
    list,
    interval,
    toggle,
    preview,
  },
  defaultSub: "list",
};
