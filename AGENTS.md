# AGENTS.md

Operating spec for any AI coding agent working in the `lumi-addons` repository.

Lumi Addons is the official first-party repository of dynamic, hot-loadable modules for the
[Lumi Discord bot](https://github.com/lumi-devs/lumi).

## Addon Architecture & Rules

Each subdirectory at the repository root (e.g. `activity-roles/`, `booster-roles/`) is an
independent, self-contained Lumi addon module.

- `info.json` — downloader metadata file (name, author, version, description, min_bot_version, end_user_data_statement).
- `manifest.json` — optional pre-compiled static module contract for fast discovery without runtime import.
- `index.ts` — entry point exporting the module class decorated with `@DefineModule`.
- `commands/` — slash and message prefix commands extending `BaseCommand` or `BaseSubcommand`.
- `listeners/` — event listeners extending `ModuleListener` or `GuildMessageListener`.
- `interaction-handlers/` — button, select menu, and modal handlers.
- `services/` — singleton background services extending `Service`.
- `scheduled-tasks/` — BullMQ delayed or cron job handlers (`RelayTask`).

## Zero Cross-Module Import Law

An addon must **never** import from a sibling addon directory.

## Strict SDK Boundary

Addon code must only import from the stable `lumi` public SDK packages:
- `lumi` — module definitions, decorators, listeners, services, config schema builders (`cfg.*`).
- `lumi/commands` — `BaseCommand`, `BaseSubcommand`, reply card helpers (`replySuccess`, `replyError`).
- `lumi/permissions` — Wick-style permit checking (`hasRequiredPermit`, `isModuleEnabled`).
- `lumi/scheduling` — scheduled task triggers (`registerTaskFireHandler`, `scheduleTask`).
- `lumi/ui` — card builders (`makeCard`, `makeSuccessCard`, `makeErrorCard`, `resolveCardColor`).
- `lumi/utils` — distributed Redis locks (`acquireRedisLock`), duration parsers, timestamps.

Never import internal paths like `#core/*`, `#lib/*`, `#utilities/*`, `#database/*`, or `@sapphire/framework` internals.

## GDPR & End-User Data Privacy

1. Every `info.json` must contain a non-empty `end_user_data_statement`.
2. Every module class must implement:
   - `public override async deleteUserData(userId: string, requester?: string): Promise<void>`
   - `public override async exportUserData(userId: string): Promise<Record<string, unknown> | null>`

## Versioning & Changesets

Versioning across all addons is managed via `@changesets/cli`:
- Run `bun run changeset` to declare a version bump and change notes.
- Run `bun run version:sync` to bump versions and automatically synchronize `package.json` version into `info.json`, `manifest.json`, and `index.ts` across every addon.

## Testing & Quality Commands

- `bun run typecheck` — TypeScript compiler checks (`tsc --noEmit`).
- `bun run lint` — ESLint code quality checks.
- `bun run test` — Vitest unit test suite across all addons.
- `bun run check:loader` — Full mock Lumi instance loader, dashboard schema validator, and slash command registry checker.
- `bun run --cwd docs build` — Static export build of the documentation website.
