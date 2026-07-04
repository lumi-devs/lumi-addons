# Addon 3: `promoter` — Status-Advertising Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members whose Discord custom status advertises the server (configured invite slugs / server tag) automatically receive a promoter role; it's removed when they stop. Log channel, self-heal sweep, persistent "check me" panel, stats.

**Architecture:** A `presenceUpdate` `ModuleListener` evaluates members live; a 5-minute interval task (broadcast fire, per-guild due-gate against a configured sweep interval) self-heals missed presence events; a persistent panel button lets members trigger their own re-check. Grant/revoke counters in module KV under a Redis lock.

**Read first:** `verify/scheduled-tasks/captchaExpiry.ts`, Global Constraints in `2026-07-04-six-addon-port-00-overview.md`.

---

### Task 1: Scaffolding, keys, pure matching logic (TDD)

**Files:**
- Create: `promoter/info.json`
- Create: `promoter/keys.ts`
- Create: `promoter/lib/matching.ts`
- Test: `promoter/lib/matching.test.ts`

**Interfaces:**
- Produces: `MODULE_NAME`, `PromoterKeys`, `PromoterData`, `PromoterStats`, `statusMatches(statusText, terms)` — consumed by Tasks 2–4.

- [ ] **Step 1: Write `promoter/info.json`**

```json
{
  "name": "promoter",
  "author": ["Antigravity"],
  "description": "Rewards members who advertise the server in their custom status (invite link or server tag) with a configurable role, removed automatically when the status changes. Includes a self-heal sweep, log cards, and a persistent check-me panel.",
  "short": "Auto-role for members advertising the server.",
  "version": "1.0.0"
}
```

- [ ] **Step 2: Write `promoter/keys.ts`**

```ts
export const MODULE_NAME = "promoter";

export const PromoterKeys = {
  /** Epoch ms of the last completed sweep for a guild. */
  lastSweep: (guildId: string) => `lumi:addon:promoter:sweep:${guildId}`,
  /** Mutex around the per-guild stats read-modify-write. */
  statsLock: (guildId: string) => `lumi:lock:promoter-stats:${guildId}`,
} as const;

export const PromoterData = {
  META: "meta",
  STATS: "stats",
} as const;

export interface PromoterStats {
  granted: number;
  revoked: number;
}
```

- [ ] **Step 3: Write the failing tests `promoter/lib/matching.test.ts`**

```ts
import { describe, expect, it } from "bun:test";
import { statusMatches } from "./matching.js";

describe("statusMatches", () => {
  const terms = [".gg/lumi", "discord.gg/lumi", "LUMI"];

  it("matches case-insensitively", () => {
    expect(statusMatches("join Discord.GG/LUMI now!", terms)).toBe(true);
    expect(statusMatches("i love lumi", terms)).toBe(true);
  });

  it("rejects non-matching statuses", () => {
    expect(statusMatches("just vibing", terms)).toBe(false);
  });

  it("rejects empty status or empty terms", () => {
    expect(statusMatches("", terms)).toBe(false);
    expect(statusMatches("anything", [])).toBe(false);
  });

  it("ignores blank terms from sloppy config", () => {
    expect(statusMatches("hello", ["", "  "])).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bun test promoter/`
Expected: FAIL — `matching.js` not found.

- [ ] **Step 5: Write `promoter/lib/matching.ts`** (pure — no `#core` imports)

```ts
/** Case-insensitive substring match of any configured term in a status text. */
export function statusMatches(statusText: string, terms: string[]): boolean {
  if (!statusText) return false;
  const haystack = statusText.toLowerCase();
  return terms.some((t) => {
    const needle = t.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test promoter/` — Expected: PASS (4 tests).

---

### Task 2: Evaluation core (config, grant/revoke, stats, logging)

**Files:**
- Create: `promoter/lib/evaluate.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `getPromoterConfig(guildId)` → `{ roleId, logChannelId, matchTerms, sweepIntervalMinutes }`; `evaluateMember(member)` → `"granted" | "revoked" | "unchanged" | "unconfigured"`; `bumpStats(guildId, field)`; `getStats(guildId)` — consumed by Tasks 3–4.

- [ ] **Step 1: Write `promoter/lib/evaluate.ts`**

```ts
import { container } from "@sapphire/framework";
import { ActivityType, type GuildMember } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { parseConfigList } from "#core/module-system/Module.js";
import { acquireRedisLock } from "#core/lib/redis-lock.js";
import { cutText } from "@sapphire/utilities";
import { makeSuccessCard, makeWarningCard, noPingCard } from "#utilities/cards.js";
import {
  MODULE_NAME,
  PromoterData,
  PromoterKeys,
  type PromoterStats,
} from "../keys.js";
import { statusMatches } from "./matching.js";

export interface PromoterConfig {
  roleId: string | null;
  logChannelId: string | null;
  matchTerms: string[];
  sweepIntervalMinutes: number;
}

export async function getPromoterConfig(
  guildId: string,
): Promise<PromoterConfig> {
  const get = (key: string) =>
    container.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [role, log, terms, sweep] = await Promise.all([
    get("promoter_role_id"),
    get("log_channel_id"),
    get("match_terms"),
    get("sweep_interval_minutes"),
  ]);
  return {
    roleId: (role as string | null) ?? null,
    logChannelId: (log as string | null) ?? null,
    matchTerms: parseConfigList(terms),
    sweepIntervalMinutes: (sweep as number | null) ?? 30,
  };
}

export async function getStats(guildId: string): Promise<PromoterStats> {
  return (
    (await container.db.guildKV.getModuleData<PromoterStats>(
      guildId,
      MODULE_NAME,
      PromoterData.META,
      PromoterData.STATS,
    )) ?? { granted: 0, revoked: 0 }
  );
}

export async function bumpStats(
  guildId: string,
  field: keyof PromoterStats,
): Promise<void> {
  const release = await acquireRedisLock(
    container.redis,
    PromoterKeys.statsLock(guildId),
    { ttlMs: 5_000, acquireTimeoutMs: 10_000 },
  );
  try {
    const stats = await getStats(guildId);
    stats[field] += 1;
    await container.db.guildKV.setModuleData(
      guildId,
      MODULE_NAME,
      PromoterData.META,
      PromoterData.STATS,
      stats,
    );
  } finally {
    await release();
  }
}

function customStatusText(member: GuildMember): string {
  const activity = member.presence?.activities.find(
    (a) => a.type === ActivityType.Custom,
  );
  return activity?.state ?? "";
}

async function log(
  guildId: string,
  logChannelId: string | null,
  card: ReturnType<typeof makeSuccessCard>,
): Promise<void> {
  if (!logChannelId) return;
  const channel = container.client.guilds.cache
    .get(guildId)
    ?.channels.cache.get(logChannelId);
  if (channel?.isTextBased()) await channel.send(card).catch(() => null);
}

export type EvaluateResult = "granted" | "revoked" | "unchanged" | "unconfigured";

/**
 * Grant or revoke the promoter role based on the member's current custom
 * status. Offline members are never *revoked* just for being unreadable —
 * only an explicitly non-matching (readable) status revokes.
 */
export async function evaluateMember(
  member: GuildMember,
): Promise<EvaluateResult> {
  if (member.user.bot) return "unchanged";
  const cfg = await getPromoterConfig(member.guild.id);
  if (!cfg.roleId || cfg.matchTerms.length === 0) return "unconfigured";
  const role = member.guild.roles.cache.get(cfg.roleId);
  if (!role) return "unconfigured";

  const hasRole = member.roles.cache.has(role.id);
  const status = customStatusText(member);
  const matches = statusMatches(status, cfg.matchTerms);

  if (matches && !hasRole) {
    await member.roles.add(role, "Promoter: server advertised in status");
    await bumpStats(member.guild.id, "granted");
    await log(
      member.guild.id,
      cfg.logChannelId,
      noPingCard(
        makeSuccessCard(
          "Promoter Role Granted",
          `${userMention(member.id)} is advertising the server.\n> ${cutText(status, 100)}`,
        ),
      ),
    );
    return "granted";
  }

  // Presence unreadable (offline / no presence intent data) → leave as-is.
  if (!matches && hasRole && member.presence && status.length > 0) {
    await member.roles.remove(role, "Promoter: status no longer advertises");
    await bumpStats(member.guild.id, "revoked");
    await log(
      member.guild.id,
      cfg.logChannelId,
      noPingCard(
        makeWarningCard(
          "Promoter Role Removed",
          `${userMention(member.id)} stopped advertising the server.`,
        ),
      ),
    );
    return "revoked";
  }

  // A member with the role and *no* custom status set is also a revoke —
  // but only when we can actually read their presence.
  if (!matches && hasRole && member.presence && status.length === 0) {
    await member.roles.remove(role, "Promoter: status no longer advertises");
    await bumpStats(member.guild.id, "revoked");
    await log(
      member.guild.id,
      cfg.logChannelId,
      noPingCard(
        makeWarningCard(
          "Promoter Role Removed",
          `${userMention(member.id)} stopped advertising the server.`,
        ),
      ),
    );
    return "revoked";
  }

  return "unchanged";
}
```

Note: the two revoke branches are identical in effect — collapse them into one condition `!matches && hasRole && member.presence` during implementation; they're written out here only to document the reasoning. Final code:

```ts
  if (!matches && hasRole && member.presence) {
    await member.roles.remove(role, "Promoter: status no longer advertises");
    await bumpStats(member.guild.id, "revoked");
    await log(
      member.guild.id,
      cfg.logChannelId,
      noPingCard(
        makeWarningCard(
          "Promoter Role Removed",
          `${userMention(member.id)} stopped advertising the server.`,
        ),
      ),
    );
    return "revoked";
  }
  return "unchanged";
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck` — Expected: clean.

---

### Task 3: Presence listener + sweep task

**Files:**
- Create: `promoter/listeners/presenceUpdate.ts`
- Create: `promoter/scheduled-tasks/promoterSweep.ts`
- Create: `promoter/lib/sweep-handler.ts`

**Interfaces:**
- Consumes: Tasks 1–2 (`evaluateMember`, `getPromoterConfig`, `PromoterKeys`).
- Produces: task name `"promoter-sweep"`, `handlePromoterSweepFire()` — registered in Task 4's `index.ts`.

- [ ] **Step 1: Write `promoter/listeners/presenceUpdate.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import { Events } from "@sapphire/framework";
import type { Presence } from "discord.js";
import { ModuleListener } from "#core/module-system/ModuleListener.js";
import { MODULE_NAME } from "../keys.js";
import { evaluateMember } from "../lib/evaluate.js";

@ApplyOptions<ModuleListener.Options>({
  module: MODULE_NAME,
  event: Events.PresenceUpdate,
})
export class PromoterPresenceListener extends ModuleListener<"presenceUpdate"> {
  // First arg is `oldPresence` and may be null; the guild lives on newPresence.
  protected override resolveGuildId(
    _old: Presence | null,
    newPresence: Presence,
  ): string | null {
    return newPresence.guild?.id ?? null;
  }

  protected async handle(
    _old: Presence | null,
    newPresence: Presence,
  ): Promise<void> {
    const member = newPresence.member;
    if (!member) return;
    await evaluateMember(member).catch((err) => {
      this.container.logger.warn(
        `[Promoter] evaluate failed for ${member.id} in ${member.guild.id}:`,
        err,
      );
    });
  }
}
```

- [ ] **Step 2: Write `promoter/scheduled-tasks/promoterSweep.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { publishTaskFire } from "#lib/scheduler-bus.js";

// Fires every 5 minutes; the handler applies the per-guild configured sweep
// interval itself (Redis last-sweep timestamp), so guilds can pick any cadence
// without re-registering the job.
@ApplyOptions<ScheduledTask.Options>({
  name: "promoter-sweep",
  interval: 300_000,
})
export class PromoterSweepTask extends ScheduledTask {
  public async run(): Promise<void> {
    await publishTaskFire("promoter-sweep", {});
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "promoter-sweep": Record<string, never>;
  }
}
```

- [ ] **Step 3: Write `promoter/lib/sweep-handler.ts`**

```ts
import { container } from "@sapphire/framework";
import { isModuleEnabled } from "#utilities/listeners.js";
import { MODULE_NAME, PromoterKeys } from "../keys.js";
import { evaluateMember, getPromoterConfig } from "./evaluate.js";
import { statusMatches } from "./matching.js";
import { ActivityType } from "discord.js";

/**
 * Broadcast sweep: every worker iterates its own guilds.cache. For each due,
 * enabled guild: re-check current role holders (drop stale) and cached online
 * members with a matching status (grant missed). Per-member failures are
 * logged and skipped so one bad member can't kill the sweep.
 */
export async function handlePromoterSweepFire(): Promise<void> {
  const { client, redis, logger } = container;

  for (const guild of client.guilds.cache.values()) {
    try {
      if (!(await isModuleEnabled(guild.id, MODULE_NAME))) continue;
      const cfg = await getPromoterConfig(guild.id);
      if (!cfg.roleId || cfg.matchTerms.length === 0) continue;

      const lastSweep = Number(
        (await redis.get(PromoterKeys.lastSweep(guild.id))) ?? 0,
      );
      if (Date.now() - lastSweep < cfg.sweepIntervalMinutes * 60_000) continue;
      await redis.set(PromoterKeys.lastSweep(guild.id), String(Date.now()));

      const role = guild.roles.cache.get(cfg.roleId);
      if (!role) continue;

      const candidates = new Map(role.members);
      for (const member of guild.members.cache.values()) {
        if (member.user.bot || candidates.has(member.id)) continue;
        const status = member.presence?.activities.find(
          (a) => a.type === ActivityType.Custom,
        )?.state;
        if (status && statusMatches(status, cfg.matchTerms)) {
          candidates.set(member.id, member);
        }
      }

      for (const member of candidates.values()) {
        await evaluateMember(member).catch((err) => {
          logger.warn(
            `[Promoter] sweep evaluate failed for ${member.id} in ${guild.id}:`,
            err,
          );
        });
      }
    } catch (err) {
      logger.warn(`[Promoter] sweep failed for guild ${guild.id}:`, err);
    }
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck` — Expected: clean.

---

### Task 4: Command, panel button, module index, README

**Files:**
- Create: `promoter/commands/promoter.ts`
- Create: `promoter/interaction-handlers/checkButton.ts`
- Create: `promoter/index.ts`
- Create: `promoter/README.md`

**Interfaces:**
- Consumes: Tasks 1–3.

- [ ] **Step 1: Write `promoter/commands/promoter.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle, type ChatInputCommandInteraction } from "discord.js";
import { roleMention } from "@discordjs/formatters";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeInfoCard } from "#utilities/cards.js";
import { getPromoterConfig, getStats } from "../lib/evaluate.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "promoter",
  description: "Promoter-role tools.",
  permissionLevel: PermissionLevel.MOD,
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "panel", chatInputRun: "chatInputPanel" },
    { name: "stats", chatInputRun: "chatInputStats" },
  ],
})
export class PromoterCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: BaseSubcommand.Registry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("panel")
            .setDescription("Post the persistent promoter info panel here"),
        )
        .addSubcommand((sub) =>
          sub.setName("stats").setDescription("Show grant/revoke totals"),
        ),
    );
  }

  public async chatInputPanel(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    // Panel posting changes the channel for everyone — gate at ADMIN.
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const cfg = await getPromoterConfig(interaction.guildId);
    if (!cfg.roleId || cfg.matchTerms.length === 0) {
      return this.replyError(
        interaction,
        "Not Configured",
        "Set `promoter_role_id` and `match_terms` in `/config` first.",
      );
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("promoter:check")
        .setLabel("Check my status")
        .setStyle(ButtonStyle.Primary),
    );
    const card = makeInfoCard(
      "Promote the Server, Get the Role",
      `Put our invite or tag in your **custom status** and receive ${roleMention(cfg.roleId)} automatically. Remove it and the role goes away.\n\nAlready did it? Hit the button to be checked right now.`,
      { actionRows: [row] },
    );
    await interaction.channel?.send(card);
    return this.replySuccess(interaction, "Panel Posted", "The promoter panel is live.");
  }

  public async chatInputStats(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const stats = await getStats(interaction.guildId);
    return this.replyInfo(
      interaction,
      "Promoter Stats",
      `**${stats.granted}** roles granted · **${stats.revoked}** roles revoked (all-time).`,
    );
  }
}
```

- [ ] **Step 2: Write `promoter/interaction-handlers/checkButton.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { isModuleEnabled } from "#utilities/listeners.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "#utilities/cards.js";
import { MODULE_NAME } from "../keys.js";
import { evaluateMember } from "../lib/evaluate.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "promoter-check",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class PromoterCheckHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    return interaction.customId === "promoter:check" ? this.some() : this.none();
  }

  public async run(interaction: ButtonInteraction) {
    if (!interaction.inCachedGuild()) return;
    if (!(await isModuleEnabled(interaction.guildId, MODULE_NAME))) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard("Disabled", "The promoter module is disabled here."),
        ),
      );
    }

    const member = await interaction.guild.members
      .fetch({ user: interaction.user.id, withPresences: true })
      .catch(() => interaction.member);
    const result = await evaluateMember(member);

    const cards = {
      granted: makeSuccessCard(
        "Role Granted",
        "Thanks for promoting the server — enjoy the role!",
      ),
      revoked: makeWarningCard(
        "Role Removed",
        "Your status no longer advertises the server, so the role was removed.",
      ),
      unchanged: makeInfoCard(
        "No Change",
        "Nothing to update. Put the server invite or tag in your **custom status** to earn the role — and note I can't read statuses of invisible members.",
      ),
      unconfigured: makeErrorCard(
        "Not Configured",
        "This server hasn't finished configuring the promoter module.",
      ),
    } as const;

    return interaction.reply(ephemeralCard(cards[result]));
  }
}
```

- [ ] **Step 3: Write `promoter/index.ts`**

```ts
import { ChannelType } from "discord.js";
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handlePromoterSweepFire } from "./lib/sweep-handler.js";

@DefineModule({
  name: "promoter",
  displayName: "Promoter",
  emoji: "📣",
  version: "1.0.0",
  description:
    "Auto-role for members advertising the server in their custom status.",
  configSchema: cfg.object({
    promoter_role_id: cfg.role({
      label: "Promoter Role",
      description: "Role granted while a member's status advertises the server.",
    }),
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel for grant/revoke event cards.",
      channelTypes: [ChannelType.GuildText],
    }),
    match_terms: cfg.string({
      label: "Match Terms",
      description:
        "Comma-separated invite slugs / tags to look for in statuses, e.g. \".gg/lumi, LUMI\".",
      list: true,
    }),
    sweep_interval_minutes: cfg.number({
      label: "Sweep Interval (minutes)",
      description: "How often the self-heal sweep re-checks members.",
      default: 30,
      min: 5,
      max: 1440,
    }),
  }),
})
export class PromoterModule extends Module {
  public override onLoad() {
    registerTaskFireHandler("promoter-sweep", "broadcast", handlePromoterSweepFire);
    return super.onLoad();
  }
  // No deleteUserData override: the addon stores only aggregate counters —
  // no per-user rows.
}
```

- [ ] **Step 4: Write `promoter/README.md`**

```markdown
# promoter

Auto-role for members who advertise the server in their Discord custom status.

- Live: `presenceUpdate` grants/revokes as statuses change.
- Self-heal: periodic sweep (per-guild `sweep_interval_minutes`) catches missed
  events. Invisible/offline members are never revoked just for being unreadable.
- `/promoter panel` (admin) — persistent info card with a "Check my status" button.
- `/promoter stats` (mod) — all-time grant/revoke counters.

Requires the **Presence** privileged intent. Configure `promoter_role_id`,
`match_terms`, `log_channel_id`, `sweep_interval_minutes` via `/config`.
```

- [ ] **Step 5: Verify**

Run: `bun run typecheck && bun run lint && bun test promoter/`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add promoter/ docs/superpowers/plans/2026-07-04-six-addon-port-03-promoter.md
git commit -m "feat(promoter): status-advertising auto-role with sweep and panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
