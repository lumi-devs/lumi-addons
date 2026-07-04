# Six-Addon Port — Plan Overview

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port five legacy Python cogs + one new presence rotator as six professional Lumi addons in this repo.

**Architecture:** Each addon is a self-contained module directory loaded by Lumi's ModuleStore (same shape as `verify/` and `thread-cleaner/`): `@DefineModule` index with a Zod `cfg` schema, Redis keys in `keys.ts`, durable state in module KV (`container.db.guildKV`), background work via BullMQ relay tasks + `registerTaskFireHandler`, all UI as Components v2 cards.

**Tech Stack:** TypeScript (Bun), Sapphire v5, discord.js v14, `#core/*` / `#lib/*` / `#utilities/*` aliases from `@lumi/core`, `bun test` for pure-logic units.

**Spec:** `docs/superpowers/specs/2026-07-04-six-addon-port-design.md`

## Execution order (one plan file each, executed in order)

1. `2026-07-04-six-addon-port-01-status.md`
2. `2026-07-04-six-addon-port-02-dragme.md`
3. `2026-07-04-six-addon-port-03-promoter.md`
4. `2026-07-04-six-addon-port-04-multi-lounge.md`
5. `2026-07-04-six-addon-port-05-confessions.md`
6. `2026-07-04-six-addon-port-06-booster-roles.md`

## Global Constraints

Every task in every plan file implicitly includes these:

- **Repo:** all paths are relative to `/home/rebiz/opt/lumi-addons-work`.
- **info.json:** `{ "name", "author": ["Antigravity"], "description", "short", "version": "1.0.0" }` — same shape as `verify/info.json`.
- **Imports:** `#core/*`, `#lib/*`, `#utilities/*`, `#database/*` aliases with `.js` suffix; relative imports only within the addon directory. Never deep-relative into `@lumi/core`.
- **Commands:** extend `BaseCommand` or `BaseSubcommand` from `#lib/commands.js`; set `permissionLevel` (from `#lib/permissions.js`); never call `setDefaultMemberPermissions`/`setContexts`/`setIntegrationTypes` in builders; reply via `this.replySuccess/-Error/-Warning/-Info` or `this.reply(interaction, ephemeralCard(card))`.
- **Cards:** only `makeInfoCard`/`makeSuccessCard`/`makeErrorCard`/`makeWarningCard`/`makeListCard` from `#utilities/cards.js`. Mentions/timestamps via `@discordjs/formatters` (`userMention`, `channelMention`, `roleMention`, `time`, `TimestampStyles`).
- **Config:** single `configSchema: cfg.object({...})` in `@DefineModule`; read with `container.db.config.getModuleConfig(guildId, "<module>", "<key>")`; list fields (`cfg.string({ list: true })`) read through `parseConfigList` (from `#core/module-system/Module.js`).
- **Module KV:** `container.db.guildKV.getModuleData/setModuleData/listModuleData/deleteModuleData`.
- **Redis:** all keys defined in the addon's `keys.ts`; never inline key strings; cross-process mutexes via `acquireRedisLock` from `#core/lib/redis-lock.js`.
- **Scheduled tasks:** directory must be exactly `scheduled-tasks/`. One-shot jobs: piece extends `ScheduledTask`, `run` = `shouldRunNow` guard + `publishTaskFire` (thread-cleaner pattern); interval jobs: `@ApplyOptions<ScheduledTask.Options>({ name, interval })` + `publishTaskFire`. Effects live in `lib/*-handler.ts` registered with `registerTaskFireHandler(name, mode, handler)` in the module's `onLoad`. Create/cancel via `scheduleTask`/`cancelTask` from `#lib/schedule-task.js` with stable `customJobOptions.jobId`. Augment `declare module "@sapphire/plugin-scheduled-tasks" { interface ScheduledTasks {...} }` in the piece file.
- **Listeners:** `ModuleListener`/`GuildMessageListener` from `#core/module-system/*.js` where a guild + enabled-gate applies; raw `Listener` + explicit `isModuleEnabled` check (from `#utilities/listeners.js`) only where the base class doesn't fit.
- **GDPR:** every addon holding per-user data overrides `deleteUserData(userId, requester)` on its module class.
- **Tests:** pure-logic helpers live in `lib/` files with **zero `#core` imports** so `bun test` can run them; test files sit next to the code as `*.test.ts` using `import { describe, expect, it } from "bun:test"`.
- **Quality gates per addon:** `bun run typecheck` and `bun run lint` pass; `bun test <addon>/` passes.
- **Commits:** one commit per addon, message `feat(<addon>): <summary>`, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
