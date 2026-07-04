# Addon 1: `status` — Presence Rotator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot-owner-managed rotating presence: `/status add|remove|list|interval|toggle|preview`, entries in module KV under a global sentinel scope, rotation via a 60s interval task that honors a configurable rotation interval.

**Architecture:** Global (not per-guild) — settings + entries live in module KV under `guildId = "global"`. A 60s interval scheduled task relays onto the bus; the broadcast fire handler checks whether the configured interval has elapsed (Redis timestamp), pops the next entry from a shuffled no-immediate-repeat queue (Redis list), resolves placeholders, and calls `client.user.setPresence`. Works on `monolith` (documented limitation for split roles).

**Read first:** `verify/index.ts`, `verify/scheduled-tasks/captchaExpiry.ts` (interval piece pattern), Global Constraints in `2026-07-04-six-addon-port-00-overview.md`.

---

### Task 1: Scaffolding + pure queue/placeholder logic (TDD)

**Files:**
- Create: `status/info.json`
- Create: `status/keys.ts`
- Create: `status/lib/rotation.ts`
- Test: `status/lib/rotation.test.ts`

**Interfaces:**
- Produces: `StatusEntry`, `GlobalSettings`, `StatusKeys`, `nextFromQueue(queue, allIds, lastId)`, `resolvePlaceholders(text, stats)` — consumed by Tasks 2–4.

- [ ] **Step 1: Write `status/info.json`**

```json
{
  "name": "status",
  "author": ["Antigravity"],
  "description": "Rotating bot presence managed at runtime by the bot owner: custom statuses with activity type, online status, and live placeholders.",
  "short": "Owner-managed rotating presence.",
  "version": "1.0.0"
}
```

- [ ] **Step 2: Write `status/keys.ts`**

```ts
// Global-scope sentinel: presence is bot-wide, so all KV rows live under this
// pseudo guild. Never pass a real guild id for status data.
export const MODULE_NAME = "status";
export const GLOBAL_SCOPE = "global";

export const StatusData = {
  /** targetId for the entries row and the settings row. */
  META: "meta",
  ENTRIES: "entries",
  SETTINGS: "settings",
} as const;

export const StatusKeys = {
  /** Redis list of entry ids still to play in this shuffle cycle. */
  queue: () => "lumi:addon:status:queue",
  /** Redis string: entry id applied most recently. */
  last: () => "lumi:addon:status:last",
  /** Redis string: epoch ms of the last applied rotation. */
  lastRotatedAt: () => "lumi:addon:status:rotated-at",
} as const;

export interface StatusEntry {
  id: number;
  text: string;
  /** discord.js ActivityType name we support. */
  type: "Custom" | "Playing" | "Listening" | "Watching" | "Competing";
  presence: "online" | "idle" | "dnd";
  addedBy: string;
  addedAt: number;
}

export interface GlobalSettings {
  enabled: boolean;
  intervalMs: number;
}

export const DEFAULT_SETTINGS: GlobalSettings = {
  enabled: true,
  intervalMs: 120_000,
};
```

- [ ] **Step 3: Write the failing tests `status/lib/rotation.test.ts`**

```ts
import { describe, expect, it } from "bun:test";
import { nextFromQueue, resolvePlaceholders } from "./rotation.js";

describe("nextFromQueue", () => {
  it("pops the head of a non-empty queue", () => {
    const r = nextFromQueue([2, 3], [1, 2, 3], 1);
    expect(r.next).toBe(2);
    expect(r.queue).toEqual([3]);
  });

  it("refills and shuffles when the queue is empty", () => {
    const r = nextFromQueue([], [1, 2, 3], null);
    expect([1, 2, 3]).toContain(r.next);
    expect(r.queue.length).toBe(2);
    expect(new Set([r.next, ...r.queue])).toEqual(new Set([1, 2, 3]));
  });

  it("never repeats the last id back-to-back when alternatives exist", () => {
    for (let i = 0; i < 50; i++) {
      const r = nextFromQueue([], [1, 2], 2);
      expect(r.next).toBe(1);
    }
  });

  it("allows a repeat when it is the only entry", () => {
    const r = nextFromQueue([], [7], 7);
    expect(r.next).toBe(7);
  });

  it("drops queued ids that no longer exist", () => {
    const r = nextFromQueue([9, 2], [1, 2], 1);
    expect(r.next).toBe(2);
  });
});

describe("resolvePlaceholders", () => {
  it("substitutes {guilds}, {users} and {shard}", () => {
    expect(
      resolvePlaceholders("on {guilds} servers, {users} users, shard {shard}", {
        guilds: 3,
        users: 1500,
        shard: 0,
      }),
    ).toBe("on 3 servers, 1500 users, shard 0");
  });

  it("leaves text without placeholders untouched", () => {
    expect(
      resolvePlaceholders("hello", { guilds: 1, users: 1, shard: 0 }),
    ).toBe("hello");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd /home/rebiz/opt/lumi-addons-work && bun test status/`
Expected: FAIL — `rotation.js` module not found.

- [ ] **Step 5: Write `status/lib/rotation.ts`** (no `#core` imports — pure)

```ts
// Pure rotation logic — no framework imports so `bun test` runs it standalone.

export interface PlaceholderStats {
  guilds: number;
  users: number;
  shard: number;
}

export function resolvePlaceholders(
  text: string,
  stats: PlaceholderStats,
): string {
  return text
    .replaceAll("{guilds}", String(stats.guilds))
    .replaceAll("{users}", String(stats.users))
    .replaceAll("{shard}", String(stats.shard));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Pop the next entry id to apply. `queue` holds ids not yet played this cycle;
 * when exhausted it is refilled with a shuffle of `allIds`, avoiding an
 * immediate repeat of `lastId` (unless it is the only entry). Ids in the queue
 * that no longer exist in `allIds` (removed entries) are skipped.
 */
export function nextFromQueue(
  queue: number[],
  allIds: number[],
  lastId: number | null,
): { next: number; queue: number[] } {
  const live = queue.filter((id) => allIds.includes(id));

  if (live.length === 0) {
    let refill = shuffle(allIds);
    if (refill.length > 1 && refill[0] === lastId) {
      // Swap the head with a random later slot so we never repeat back-to-back.
      const j = 1 + Math.floor(Math.random() * (refill.length - 1));
      [refill[0], refill[j]] = [refill[j]!, refill[0]!];
    }
    const [next, ...rest] = refill;
    return { next: next!, queue: rest };
  }

  const [next, ...rest] = live;
  return { next: next!, queue: rest };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test status/`
Expected: PASS (7 tests).

---

### Task 2: KV data layer

**Files:**
- Create: `status/lib/data.ts`

**Interfaces:**
- Consumes: `StatusEntry`, `GlobalSettings`, `DEFAULT_SETTINGS`, `MODULE_NAME`, `GLOBAL_SCOPE`, `StatusData` from Task 1.
- Produces: `getEntries()`, `saveEntries(entries)`, `addEntry(e)`, `removeEntry(id)`, `getSettings()`, `saveSettings(s)` — consumed by Tasks 3–4.

- [ ] **Step 1: Write `status/lib/data.ts`**

```ts
import { container } from "@sapphire/framework";
import {
  DEFAULT_SETTINGS,
  GLOBAL_SCOPE,
  MODULE_NAME,
  StatusData,
  type GlobalSettings,
  type StatusEntry,
} from "../keys.js";

export async function getEntries(): Promise<StatusEntry[]> {
  return (
    (await container.db.guildKV.getModuleData<StatusEntry[]>(
      GLOBAL_SCOPE,
      MODULE_NAME,
      StatusData.META,
      StatusData.ENTRIES,
    )) ?? []
  );
}

export async function saveEntries(entries: StatusEntry[]): Promise<void> {
  await container.db.guildKV.setModuleData(
    GLOBAL_SCOPE,
    MODULE_NAME,
    StatusData.META,
    StatusData.ENTRIES,
    entries,
  );
}

export async function addEntry(
  entry: Omit<StatusEntry, "id">,
): Promise<StatusEntry> {
  const entries = await getEntries();
  const id = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const full: StatusEntry = { id, ...entry };
  await saveEntries([...entries, full]);
  return full;
}

/** Returns true when an entry with that id existed and was removed. */
export async function removeEntry(id: number): Promise<boolean> {
  const entries = await getEntries();
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  await saveEntries(next);
  return true;
}

export async function getSettings(): Promise<GlobalSettings> {
  return (
    (await container.db.guildKV.getModuleData<GlobalSettings>(
      GLOBAL_SCOPE,
      MODULE_NAME,
      StatusData.META,
      StatusData.SETTINGS,
    )) ?? DEFAULT_SETTINGS
  );
}

export async function saveSettings(s: GlobalSettings): Promise<void> {
  await container.db.guildKV.setModuleData(
    GLOBAL_SCOPE,
    MODULE_NAME,
    StatusData.META,
    StatusData.SETTINGS,
    s,
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors in `status/` (pre-existing errors elsewhere are out of scope).

---

### Task 3: Rotation fire handler + interval task piece

**Files:**
- Create: `status/lib/rotate-handler.ts`
- Create: `status/scheduled-tasks/statusRotate.ts`

**Interfaces:**
- Consumes: Task 1 (`StatusKeys`, `nextFromQueue`, `resolvePlaceholders`, `StatusEntry`), Task 2 (`getEntries`, `getSettings`).
- Produces: `applyNextStatus(force)` and `handleStatusRotateFire()` — consumed by Task 4 (`preview` calls `applyNextStatus(true)`; `index.ts` registers the handler).

- [ ] **Step 1: Write `status/lib/rotate-handler.ts`**

```ts
import { container } from "@sapphire/framework";
import { ActivityType, type PresenceStatusData } from "discord.js";
import { StatusKeys, type StatusEntry } from "../keys.js";
import { getEntries, getSettings } from "./data.js";
import { nextFromQueue, resolvePlaceholders } from "./rotation.js";

const ACTIVITY_TYPES: Record<StatusEntry["type"], ActivityType> = {
  Custom: ActivityType.Custom,
  Playing: ActivityType.Playing,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing,
};

/**
 * Apply the next status in the rotation. Returns the applied entry, or null
 * when disabled / no entries / not yet due. `force` skips the due-check and
 * enabled-check (used by `/status preview`).
 *
 * Presence updates go over the gateway WS, so this only has an effect on the
 * process that owns the connection (monolith). See the addon README.
 */
export async function applyNextStatus(
  force = false,
): Promise<StatusEntry | null> {
  const { client, redis, logger } = container;
  const settings = await getSettings();

  if (!force) {
    if (!settings.enabled) return null;
    const rotatedAt = Number((await redis.get(StatusKeys.lastRotatedAt())) ?? 0);
    if (Date.now() - rotatedAt < settings.intervalMs) return null;
  }

  const entries = await getEntries();
  if (entries.length === 0 || !client.user) return null;

  const queue = (await redis.lrange(StatusKeys.queue(), 0, -1)).map(Number);
  const lastRaw = await redis.get(StatusKeys.last());
  const lastId = lastRaw === null ? null : Number(lastRaw);

  const allIds = entries.map((e) => e.id);
  const { next, queue: rest } = nextFromQueue(queue, allIds, lastId);
  const entry = entries.find((e) => e.id === next)!;

  const users = client.guilds.cache.reduce(
    (sum, g) => sum + (g.memberCount ?? 0),
    0,
  );
  const text = resolvePlaceholders(entry.text, {
    guilds: client.guilds.cache.size,
    users,
    shard: client.shard?.ids[0] ?? 0,
  });

  client.user.setPresence({
    status: entry.presence as PresenceStatusData,
    activities: [{ name: text, type: ACTIVITY_TYPES[entry.type] }],
  });

  const multi = redis
    .multi()
    .del(StatusKeys.queue())
    .set(StatusKeys.last(), String(entry.id))
    .set(StatusKeys.lastRotatedAt(), String(Date.now()));
  if (rest.length > 0) multi.rpush(StatusKeys.queue(), ...rest.map(String));
  await multi.exec();

  logger.debug(`[Status] Applied status #${entry.id}: ${text}`);
  return entry;
}

export async function handleStatusRotateFire(): Promise<void> {
  await applyNextStatus(false);
}
```

- [ ] **Step 2: Write `status/scheduled-tasks/statusRotate.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// Fires every 60s; the handler applies the *configured* interval itself via a
// Redis rotated-at timestamp, so changing `/status interval` needs no job
// re-registration.
@ApplyOptions<ScheduledTask.Options>({
  name: "status-rotate",
  interval: 60_000,
})
export class StatusRotateTask extends ScheduledTask {
  public async run(): Promise<void> {
    await publishTaskFire("status-rotate", {});
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "status-rotate": Record<string, never>;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck` — Expected: clean for `status/`.

---

### Task 4: `/status` owner command + module index + README

**Files:**
- Create: `status/commands/status.ts`
- Create: `status/index.ts`
- Create: `status/README.md`

**Interfaces:**
- Consumes: Tasks 1–3 (`addEntry`, `removeEntry`, `getEntries`, `getSettings`, `saveSettings`, `applyNextStatus`, `handleStatusRotateFire`, `StatusEntry`).

- [ ] **Step 1: Write `status/commands/status.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import type { ChatInputCommandInteraction } from "discord.js";
import { time, TimestampStyles, userMention } from "@discordjs/formatters";
import { Duration, DurationFormatter } from "@sapphire/time-utilities";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { ephemeralCard, makeListCard } from "#utilities/cards.js";
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
  public override registerApplicationCommands(
    registry: BaseSubcommand.Registry,
  ) {
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
      ? this.replySuccess(interaction, "Status Removed", `Entry **#${id}** deleted.`)
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
    return this.reply(
      interaction,
      ephemeralCard(makeListCard("Rotating Statuses", lines)),
    );
  }

  public async chatInputInterval(interaction: ChatInputCommandInteraction) {
    const raw = interaction.options.getString("duration", true);
    const ms = new Duration(raw).offset;
    if (!Number.isFinite(ms) || ms < 30_000) {
      return this.replyError(
        interaction,
        "Invalid Duration",
        'Provide a duration of at least 30 seconds, e.g. `2m` or `1h30m`.',
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
```

- [ ] **Step 2: Write `status/index.ts`**

```ts
import { Module, DefineModule } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handleStatusRotateFire } from "./lib/rotate-handler.js";
import { getEntries, saveEntries } from "./lib/data.js";

@DefineModule({
  name: "status",
  displayName: "Status Rotator",
  emoji: "🔁",
  version: "1.0.0",
  description:
    "Rotating bot presence managed by the bot owner via /status. Global — not per-guild.",
})
export class StatusModule extends Module {
  public override onLoad() {
    // "broadcast": each WS-owning process applies presence to its own shards.
    registerTaskFireHandler("status-rotate", "broadcast", handleStatusRotateFire);
    return super.onLoad();
  }

  public override async deleteUserData(userId: string): Promise<void> {
    // Only per-user data is the `addedBy` audit field on entries.
    const entries = await getEntries();
    if (!entries.some((e) => e.addedBy === userId)) return;
    await saveEntries(
      entries.map((e) =>
        e.addedBy === userId ? { ...e, addedBy: "deleted" } : e,
      ),
    );
  }
}
```

- [ ] **Step 3: Write `status/README.md`**

```markdown
# status

Owner-managed rotating bot presence.

- `/status add <text> [type] [presence]` — placeholders: `{guilds}`, `{users}`, `{shard}`
- `/status remove <id>` · `/status list` · `/status interval <duration>` · `/status toggle` · `/status preview`

All commands require **bot owner** permission level. Entries and settings are
global (presence is bot-wide), stored in module KV under the `global` scope.

## Limitation

Presence updates ride the gateway WebSocket, so rotation takes effect on the
`monolith` role (the default `docker compose up` topology). On a split
gateway/worker deployment the worker has no WS and the rotation is a no-op;
gateway-side presence relay is future work.
```

- [ ] **Step 4: Verify**

Run: `bun run typecheck && bun run lint && bun test status/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add status/ docs/superpowers/plans/2026-07-04-six-addon-port-01-status.md
git commit -m "feat(status): owner-managed rotating presence addon

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
