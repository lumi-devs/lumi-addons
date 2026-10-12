# AGENTS.md

Operating spec for any AI coding agent working in the `lumi-addons` repository.

Lumi Addons is the first-party addon repository for the Lumi Discord bot: Bun + TypeScript,
discord.js v14 (native), Prisma/PostgreSQL. Each directory at the repo root is an independent
addon loaded at runtime by the bot's `ModuleStore`.

## Repo shape

```
<addon-name>/
  Index.ts           # defineModule({...}) entrypoint — required
  manifest.json      # static discovery contract — required
  commands/          # CommandDef exports
  listeners/         # defineListener + addListenerDef exports
  interactions/      # defineInteraction exports (prefix/match + run)
  tasks/             # fire handlers registered in onLoad
  utilities/         # pure helpers
  services/          # background services
  data/              # db accessors
scripts/
  validate.ts        # static addon validator
  setup.sh           # symlink helper
```

Non-addon directories at root: `scripts/`, `data/`, `docs/`, `node_modules/`, dotfiles.

## Import paths

tsconfig paths (`tsconfig.json`) map `#src/*` and `#lib/*` to `.lumi/src/*` and
`.lumi/src/lib/*` respectively. Always keep the `.js` suffix on relative specifiers
and on `#src/` / `#lib/` specifiers.

`.lumi` is a symlink to the local Lumi checkout. `node_modules` is a symlink to
`.lumi/node_modules`. Run `bun run setup` (or `sh scripts/setup.sh`) once after cloning.

## Module system

Every addon exports a `defineModule({...})` object from its `Index.ts`
(`#lib/module-system/Module.js`). The loader checks `__lumiModule === true` on the export.

### manifest.json required fields

`name`, `displayName`, `emoji`, `description`, `short`, `endUserDataStatement`,
`version`, `disableable`.

Optional: `dependencies`, `conflicts`, `configOverrides`, `configFields`, `category`,
`author`, `min_bot_version`.

### CommandDef rules

Files in `commands/` export named `*Def` objects. Each must have:
- `name` string
- `run` function or `handlers` object

**Never** add `defaultMemberPermissions` — it is derived automatically from
`requiredPermit` / `botOwner` / `guildOwner`.

### ListenerDef rules

Files in `listeners/` call `defineListener` + `addListenerDef`.

### InteractionDef rules

Files in `interactions/` call `defineInteraction` with `prefix`/`match` + `run`.

## Zero cross-addon import law

An addon must never import from a sibling addon directory. Shared code belongs in the
addon's own `utilities/` or `lib/` subdirectory, or in the bot's `#lib/*`.

## GDPR hooks

Every `defineModule` call must include implementations of:
- `deleteUserData(userId: string): Promise<void>`
- `exportUserData(userId: string): Promise<Record<string, unknown> | null>`

## Anti-patterns

- **Database**: use `container.db`, never `container.prisma` directly.
- **Embeds**: never construct `new EmbedBuilder()`. Use card builders from
  `#lib/ui/Cards.js` or `ctx.replySuccess` / `ctx.replyError`.
- **No phantom imports**: never import from bare `lumi`, `lumi/commands`, `lumi/*`,
  `#core/*`, `#utilities/*`, or `#database/*`. Use `#src/*` / `#lib/*` paths only.
- **No comments** in new or edited code.

## Running things

`bun`, `gh`, etc. come from the Nix devshell: `nix develop --command <cmd>`.

- `bun run typecheck` -- `bunx tsc --noEmit -p tsconfig.json`
- `bun run lint` / `bun run lint:fix` -- eslint over addon sources
- `bun run test` -- `bun test`
- `bun run validate` -- static addon validator (`scripts/validate.ts`)
- `bun run setup` -- create `.lumi` + `node_modules` symlinks
