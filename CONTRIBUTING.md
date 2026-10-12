# Contributing to Lumi Addons

## Setup

```sh
git clone https://github.com/lumi-devs/lumi ../lumi
bun install --cwd ../lumi
git clone https://github.com/lumi-devs/lumi-addons
cd lumi-addons
bun run setup
```

`bun run setup` creates `.lumi -> ../lumi` and `node_modules -> .lumi/node_modules`.
If your Lumi checkout is elsewhere: `LUMI_PATH=/path/to/lumi bun run setup`.

## Workflow

1. Create or edit your addon directory.
2. Run verification gates:
   ```sh
   bun run typecheck
   bun run lint
   bun run test
   bun run validate
   ```
3. All four must pass before opening a PR.

## Rules

- **Zero cross-addon imports.** Never import from a sibling addon directory.
- **No phantom imports.** Use `#lib/*` and `#src/*` paths only. Never import from
  bare `lumi`, `lumi/commands`, `lumi/*`, `#core/*`, `#utilities/*`, or `#database/*`.
- **No `new EmbedBuilder()`.** All responses go through card builders in
  `#lib/ui/Cards.js` or `ctx.replySuccess` / `ctx.replyError`.
- **No `container.prisma`.** Use `container.db` only.
- **No `defaultMemberPermissions` on CommandDef.** Set `requiredPermit`, `botOwner`,
  or `guildOwner` instead.
- **GDPR hooks required.** Every `defineModule` must implement `deleteUserData` and
  `exportUserData`.
- **`endUserDataStatement` required** in both `manifest.json` and `defineModule`.

## Addon structure

```
my-addon/
  Index.ts        # defineModule({...}) entrypoint
  manifest.json   # static discovery contract
  commands/       # *Def exports (name + run or handlers)
  listeners/      # defineListener + addListenerDef
  interactions/   # defineInteraction (prefix/match + run)
  tasks/          # task fire handlers
  utilities/      # pure helpers
  services/       # background services
  data/           # db accessors
```

## Example Index.ts

```ts
import { defineModule } from "#lib/module-system/Module.js";

export const meta = defineModule({
  name: "my-addon",
  displayName: "My Addon",
  emoji: "🚀",
  version: "1.0.0",
  description: "What it does.",
  short: "Short description.",
  endUserDataStatement: "Describe what user data is stored and why.",
  async deleteUserData(_userId) {},
  async exportUserData(_userId) { return null; },
});
```

## Example CommandDef

```ts
import { defineCommand } from "#lib/commands/Define.js";

export const myCommandDef = defineCommand({
  name: "mycommand",
  description: "Does something.",
  async run(ctx) {
    await ctx.replySuccess("Done.");
  },
});
```
