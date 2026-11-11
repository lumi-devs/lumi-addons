# Contributing to Lumi Addons

## Setup

```sh
git clone https://github.com/lumi-devs/Lumi ../lumi-v2
git clone https://github.com/lumi-devs/lumi-addons
cd lumi-addons
(cd ../lumi-v2 && nix develop --command sh -c 'bun install && bun run db:generate')
nix develop --command bun run setup
```

`bun run setup` creates `.lumi -> ../lumi-v2` and `node_modules -> .lumi/node_modules`.
Set `LUMI_PATH=/path/to/lumi-v2` if the checkout is elsewhere.

## Workflow

1. Create or edit your addon directory (flat, name matches `manifest.json`).
2. Run verification gates:
   ```sh
   nix develop --command bun run validate
   nix develop --command bun run typecheck
   nix develop --command bun run lint
   nix develop --command bun run test
   ```
3. All four must pass before opening a PR.

## Rules

- **Flat modules.** One directory per addon, `name` equals the directory. No supermodules, no nested addons.
- **Zero cross-addon imports.** Never import from a sibling addon.
- **Allowed imports only:** `@lumi/module-kit`, `@lumi/foundation`, `@lumi/ui`, `discord.js`, `zod`, `node:*`, and relative `.js` paths inside the addon.
- **No `new EmbedBuilder()`.** All responses go through card builders from `@lumi/ui`.
- **No direct database access.** Use `services.helpers.moduleData` / `services.helpers.economy`; never import Prisma or Redis packages.
- **No `defaultMemberPermissions` on builders.** Use `requiredPermit` plus a runtime Discord permission check.
- **GDPR hooks required** when user data is stored: `dataLifecycle.exportUserData` and `deleteUserData`.
- **`endUserDataStatement` required** in `manifest.json`.
- **No comments** in new code.

## Addon structure

```
my-addon/
  manifest.json   # discovery metadata (apiVersion 2)
  index.ts        # default export: defineModule({...})
  commands/       # command definitions
  listeners/      # discord.js listeners
  tasks/          # cron task definitions
  ui.ts           # card builders
  data.ts         # moduleData accessors
  README.md       # user docs
```

See [AGENTS.md](./AGENTS.md) for the full contract and an index.ts example.
