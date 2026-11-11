# AGENTS.md

Operating spec for AI coding agents working in `lumi-addons` (Lumi v2).

## Repo shape

Every top-level directory is one independent addon module. There is no grouping, no supermodule, no nested addon.

```
<addon-name>/
  manifest.json      # thin discovery metadata (required)
  index.ts           # default export: defineModule({...}) (required)
  commands/          # optional command definitions
  listeners/         # optional discord.js listeners (components, modals, events)
  tasks/             # optional scheduled task definitions
  ui.ts              # optional card/view builders
  data.ts            # optional moduleData accessors
  tests/             # optional unit tests
  README.md          # required user docs
```

Non-addon root directories: `scripts/`, `docs/`, `node_modules/`, `.lumi/`, dotfiles.

## Setup

`bun` comes from the Nix devshell. Link this repo to a local Lumi v2 checkout:

```bash
(cd ../lumi-v2 && nix develop --command bun install)
nix develop --command bun run setup        # creates .lumi + node_modules symlinks
```

Environment: `LUMI_PATH` overrides the default `../lumi-v2`.

## Imports

Allowed bare imports: `@lumi/module-kit`, `@lumi/foundation`, `@lumi/ui`, `discord.js`, `zod`, `node:*`, `bun:*`.

- Relative imports MUST end in `.js`.
- Relative imports MUST stay inside the addon directory.
- NEVER import from a sibling addon, `#src/*`, `#lib/*`, `lumi`, `@lumi-devs/*`, `@lumi/db`, `@lumi/module-runtime`, or any other internal package.
- Import UI only from `@lumi/ui`; never construct embeds.

## Manifest

```json
{
  "apiVersion": 2,
  "name": "example",
  "displayName": "Example",
  "emoji": "✨",
  "category": "Utility",
  "description": "One sentence, <= 200 chars.",
  "version": "2.0.0",
  "entry": "index.ts",
  "configKey": "example-config",
  "configFields": [],
  "requirements": [],
  "conflicts": [],
  "capabilities": [],
  "endUserDataStatement": "What is stored and why."
}
```

- `name` MUST equal the directory name.
- `entry` MUST exist.
- `configFields[].key` MUST match a field in the zod config schema.
- Categories are short UI groups: `Utility`, `Community`, `Moderation`, `Security`, `Economy`, `Voice`, `Roles`.

## Module definition

`index.ts` default-exports `defineModule({...})` from `@lumi/module-kit`. Required fields: `name`, `displayName`, `emoji`, `description`, `version`, `config`, `commands`, `listeners`, `tasks`, `onLoad`, `onUnload`.

- `config` is a zod schema; parse defaults with `schema.parse({})`.
- Read config with `services.moduleConfig.read(guildId, services.moduleName ?? ModuleName, ConfigKey)`.
- Commands: `data: new SlashCommandBuilder()`, `execute(interaction, services)`.
- Component and modal handlers: one `interactionCreate` listener per addon, filtered by a customId prefix of `${ModuleName}:`.
- Periodic work: `TaskDefinition` with a 5-field cron and a per-guild state guard.
- One-shot work: `services.scheduler`.
- `requiredPermit` on mod/admin commands. Dispatch enforces it; still verify Discord permissions for bot actions.
- NEVER set `defaultMemberPermissions` on builders.

## Data

All durable state goes through `services.helpers.moduleData` (Postgres + Redis cache):

```ts
get / set / take / delete / deleteTarget / deleteModule / deleteForUser / list / incr / count
```

- `targetId` is the entity (`userId`, channelId, messageId, or `"_"` for guild-wide).
- `key` is the record kind.
- Use `ttlMs` for expiring records instead of manual timestamps.
- Use `list({ prefix })` for collections; never store unbounded arrays in one record.
- Use `services.helpers.economy` for ledger-backed money.
- No local files, no secrets, no `data/` directory.

GDPR: implement `dataLifecycle.exportUserData` and `deleteUserData` whenever user data is stored. Use `moduleData.deleteForUser(ModuleName, userId)`.

## UX

- Components V2 only. Use card builders from `@lumi/ui`.
- Errors and denials are ephemeral.
- Panels embed the invoking user id in customIds and reject other users.
- Public role/user mentions use `noPingCard`.
- Paginate long lists; use timestamps for dates.

## Verification

```bash
nix develop --command bun run validate
nix develop --command bun run typecheck
nix develop --command bun run lint
nix develop --command bun run test
```

`validate` checks manifests, entry files, import boundaries, and supermodule leakage. Tests are for non-obvious pure logic only.

## Style

- No comments in new code.
- No `any`; prefer `unknown` + zod.
- No compatibility shims, no dead code, no v1 fallbacks.
- No cross-addon imports. No phantom imports.
