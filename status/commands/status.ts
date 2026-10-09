import { defineCommand, type CommandContext } from "lumi/commands";
import { makeInfoCard } from "lumi/ui";
import { MIN_INTERVAL_MS, type StatusEntry } from "../keys.js";
import {
  addEntry,
  getEntries,
  getState,
  removeEntry,
  saveState,
} from "../lib/data.js";
import { formatDurationMs, parseDurationMs } from "../lib/duration.js";
import { ensureScheduled, nudgeGuild } from "../lib/rotate-handler.js";

const TYPES: StatusEntry["type"][] = [
  "Custom",
  "Playing",
  "Listening",
  "Watching",
  "Competing",
];
const PRESENCES: StatusEntry["presence"][] = ["online", "idle", "dnd"];

function formatEntry(e: StatusEntry): string {
  const kind = e.type === "Custom" ? "" : `${e.type} `;
  return `**#${e.id}** ${kind}${e.text} *(${e.presence})* — <@${e.addedBy}>, <t:${Math.floor(e.addedAt / 1000)}:R>`;
}

async function guildIdOrWarn(ctx: CommandContext): Promise<string | null> {
  if (ctx.guildId) return ctx.guildId;
  await ctx.replyError(
    "Guild Only",
    "This command only works inside a server.",
  );
  return null;
}

async function add(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("owner.*");
  const guildId = await guildIdOrWarn(ctx);
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

  const entry = await addEntry(guildId, {
    text,
    type,
    presence,
    addedBy: ctx.user.id,
    addedAt: Date.now(),
  });
  await ensureScheduled(guildId).catch(() => undefined);
  await ctx.replySuccess(
    "Status Added",
    `**#${entry.id}** — ${type === "Custom" ? "" : `${type} `}${text} *(${presence})*`,
  );
}

async function remove(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("owner.*");
  const guildId = await guildIdOrWarn(ctx);
  if (!guildId) return;
  const id = await ctx.getInteger("id");
  if (id === null) {
    await ctx.replyError(
      "Missing ID",
      "Provide the entry id, e.g. `status remove 3`. See `status list`.",
    );
    return;
  }
  const removed = await removeEntry(guildId, id);
  if (removed) {
    await ensureScheduled(guildId).catch(() => undefined);
    await ctx.replySuccess("Status Removed", `Entry **#${id}** deleted.`);
  } else {
    await ctx.replyError(
      "Not Found",
      `No status with id **#${id}** — check \`status list\`.`,
    );
  }
}

async function list(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("owner.*");
  const guildId = await guildIdOrWarn(ctx);
  if (!guildId) return;
  const [entries, state] = await Promise.all([
    getEntries(guildId),
    getState(guildId),
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
    shown.push(`…and ${entries.length - shown.length} more.`);
  }
  await ctx.reply(
    makeInfoCard("Rotating Statuses", [header, "", ...shown].join("\n")),
  );
}

async function interval(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("owner.*");
  const guildId = await guildIdOrWarn(ctx);
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
  const state = await getState(guildId);
  await saveState(guildId, {
    ...state,
    intervalMs: ms,
    nextAtMs: Date.now() + ms,
  });
  await ensureScheduled(guildId).catch(() => undefined);
  await ctx.replySuccess(
    "Interval Updated",
    `Statuses now rotate every **${formatDurationMs(ms)}**.`,
  );
}

async function toggle(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("owner.*");
  const guildId = await guildIdOrWarn(ctx);
  if (!guildId) return;
  const state = await getState(guildId);
  const enabled = !state.enabled;
  await saveState(guildId, { ...state, enabled });
  await ensureScheduled(guildId).catch(() => undefined);
  await ctx.replySuccess(
    enabled ? "Rotation Enabled" : "Rotation Disabled",
    enabled
      ? "The presence will rotate on the configured interval."
      : "The presence is frozen until re-enabled.",
  );
}

async function preview(ctx: CommandContext): Promise<void> {
  await ctx.checkPermit("owner.*");
  const guildId = await guildIdOrWarn(ctx);
  if (!guildId) return;
  const state = await getState(guildId);
  await saveState(guildId, { ...state, nextAtMs: 0 });
  const applied = await nudgeGuild(guildId);
  if (applied) {
    await ctx.replySuccess(
      "Status Applied",
      `Now showing **#${applied.id}** — ${applied.text}`,
    );
  } else {
    await ctx.replyError(
      "Nothing to Apply",
      "Add entries with `status add` and enable rotation with `status toggle`.",
    );
  }
}

const TYPE_CHOICES = TYPES.map((t) => ({ name: t, value: t }));
const PRESENCE_CHOICES = PRESENCES.map((p) => ({ name: p, value: p }));

export default defineCommand({
  name: "status",
  description: "Manage the bot's rotating presence.",
  build: () => ({
    name: "status",
    description: "Manage the bot's rotating presence.",
    options: [
      {
        type: 1,
        name: "add",
        description: "Add a rotating status",
        options: [
          {
            type: 3,
            name: "text",
            description:
              "Status text; supports {guilds}, {users}",
            required: true,
            max_length: 128,
          },
          {
            type: 3,
            name: "type",
            description: "Activity type (default Custom)",
            required: false,
            choices: TYPE_CHOICES,
          },
          {
            type: 3,
            name: "presence",
            description: "Online status (default idle)",
            required: false,
            choices: PRESENCE_CHOICES,
          },
        ],
      },
      {
        type: 1,
        name: "remove",
        description: "Remove a status by id",
        options: [
          {
            type: 4,
            name: "id",
            description: "Entry id from /status list",
            required: true,
          },
        ],
      },
      {
        type: 1,
        name: "list",
        description: "List all rotating statuses",
      },
      {
        type: 1,
        name: "interval",
        description: "Set the rotation interval",
        options: [
          {
            type: 3,
            name: "duration",
            description: 'e.g. "2m", "1h30m" (minimum 30s)',
            required: true,
          },
        ],
      },
      {
        type: 1,
        name: "toggle",
        description: "Enable/disable rotation",
      },
      {
        type: 1,
        name: "preview",
        description: "Apply the next status immediately",
      },
    ],
  }),
  run: async (ctx: CommandContext) => {
    const sub = (
      ctx.subcommand ??
      (await ctx.getString("subcommand")) ??
      "list"
    ).toLowerCase();
    if (sub === "add") return add(ctx);
    if (sub === "remove") return remove(ctx);
    if (sub === "interval") return interval(ctx);
    if (sub === "toggle") return toggle(ctx);
    if (sub === "preview") return preview(ctx);
    return list(ctx);
  },
  handlers: {
    add,
    remove,
    list,
    interval,
    toggle,
    preview,
  },
});
