<div align="center">
  <br />
  <img src="https://github.com/lumi-devs/lumi/raw/main/assets/banner.png" alt="Lumi Addons" width="700">
  <br /><br />

  <p>
    <a href="https://github.com/lumi-devs/lumi-addons/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi-addons/ci.yml?branch=main&style=flat-square&label=CI&logo=github" alt="CI"></a>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3+-black?style=flat-square&logo=bun" alt="Bun"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-green?style=flat-square" alt="AGPL v3"></a>
    <a href="https://github.com/lumi-devs/lumi"><img src="https://img.shields.io/badge/requires-lumi%20core-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Requires Lumi"></a>
  </p>
</div>

---

First-party dynamic addons for the [Lumi Discord bot](https://github.com/lumi-devs/lumi).
Each top-level directory is an independent addon loaded at runtime by the bot's module loader.

## Addons

| Directory | Description |
|---|---|
| `activity-roles` | Role grants based on voice/activity presence |
| `booster-roles` | Custom roles for server boosters |
| `confessions` | Anonymous confession channel system |
| `dragme` | Move members between voice channels |
| `economy-games` | Coin economy and minigames |
| `multi-lounge` | Auto-expanding voice lounges |
| `promoter` | Server partnership and promotion tools |
| `rolementions` | Pingable role toggle system |
| `status` | Bot status rotation |
| `thread-cleaner` | Automatic thread archival and cleanup |
| `utility` | General utility commands |

## Addon structure

```
my-addon/
  Index.ts        # defineModule({...}) entrypoint
  manifest.json   # static discovery contract
  commands/       # CommandDef exports
  listeners/      # defineListener + addListenerDef
  interactions/   # defineInteraction (prefix/match + run)
  tasks/          # task fire handlers
  utilities/      # pure helpers
  services/       # background services
  data/           # db accessors
```

### Index.ts

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
  async deleteUserData(userId) { /* ... */ },
  async exportUserData(userId) { return null; },
});
```

### manifest.json

```json
{
  "name": "my-addon",
  "displayName": "My Addon",
  "emoji": "🚀",
  "description": "What it does.",
  "short": "Short description.",
  "endUserDataStatement": "Describe what user data is stored and why.",
  "version": "1.0.0",
  "disableable": true
}
```

## Import paths

Addons import shared bot internals via `#lib/*` and `#src/*` path aliases
(mapped to `.lumi/src/lib/*` and `.lumi/src/*` by `tsconfig.json`).
Always keep the `.js` suffix.

```ts
import { defineModule } from "#lib/module-system/Module.js";
import { makeSuccessCard } from "#lib/ui/Cards.js";
```

Never import from `lumi`, `lumi/*`, `#core/*`, `#utilities/*`, or sibling addon directories.

## Developing

```sh
git clone https://github.com/lumi-devs/lumi ../lumi
bun install --cwd ../lumi
git clone https://github.com/lumi-devs/lumi-addons
cd lumi-addons
bun run setup
bun run typecheck
bun run test
```

`bun run setup` creates two symlinks: `.lumi -> ../lumi` and `node_modules -> .lumi/node_modules`.

## License

[AGPL v3](LICENSE) (c) Lumi Developers
