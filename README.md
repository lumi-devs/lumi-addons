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

  <p>
    <a href="#addons">Addons</a> •
    <a href="#installation">Installation</a> •
    <a href="#developing">Developing</a> •
    <a href="#contributing">Contributing</a>
  </p>
</div>

---

First-party addon modules for [Lumi](https://github.com/lumi-devs/lumi). Each addon is a self-contained, hot-loadable module — install without restarts, configure with `/config`, uninstall just as easily.

## Addons

| Addon | Description |
| :--- | :--- |
| `activity-roles` | Assign roles based on members' rich presence activity |
| `booster-roles` | Custom booster roles with configurable grace periods |
| `confessions` | Anonymous confessions channel with optional thread support |
| `dragme` | Consent-based voice drag requests between channels |
| `multi-lounge` | Auto-scaling dynamic voice channels |
| `promoter` | Reward members for wearing the server tag in their status |
| `rolementions` | Track role mentions and protect sensitive roles |
| `status` | Global rotating bot presence manager |
| `thread-cleaner` | Auto-archive and lock inactive threads |
| `utility` | Translator, emoji stealer, and other essentials |
| `verify` | Captcha verification with timeout and expiry handling |

## Installation

Lumi's built-in module manager handles everything. No restarts required.

```sh
# Add this repository to your Lumi instance
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git

# Install any addon
,download lumi-addons <addon-name>

# Enable it in your server
/modules enable <addon-name>
```

## Developing

Addons run against the Lumi core type system. You'll need a local Lumi checkout first.

```sh
# Clone both repos side by side
git clone https://github.com/lumi-devs/lumi ../lumi
git clone https://github.com/lumi-devs/lumi-addons . && cd lumi-addons

# Install deps (installs lumi core's node_modules and links aliases)
bun run setup

# Check types and lint
bun run typecheck
bun run lint
```

### Testing

Pure-logic helpers (validation, formatting, matching, scaling decisions — no
Discord.js or Lumi container dependency) live in each addon's `lib/` directory
and are unit-tested with [Vitest](https://vitest.dev). No Lumi core checkout
is needed for these — the tests only import sibling `.ts` files.

```sh
bun run test           # run once
bun run test:watch     # watch mode
bun run test:coverage  # with a coverage report
```

Each addon's `lib/*.test.ts` sits next to the file it covers, e.g.
[`booster-roles/lib/engine.test.ts`](booster-roles/lib/engine.test.ts) tests
[`booster-roles/lib/engine.ts`](booster-roles/lib/engine.ts). When adding a
new pure helper, add its test the same way — only side-effect-free logic is
worth covering this way; anything that talks to Discord's API or the database
belongs in a manual test pass instead.

### Writing an addon

Each addon is a directory at the root of this repo containing:

```
my-addon/
├── index.ts              # @DefineModule entry point
├── commands/             # Slash commands (extend BaseCommand)
├── listeners/            # Event listeners (extend ModuleListener)
├── interaction-handlers/ # Buttons, modals, select menus
├── services/             # Singleton services (extend Service)
└── scheduled-tasks/      # BullMQ tasks (extend RelayTask)
```

See an existing addon like [`booster-roles/`](booster-roles/) for a full example.

## Contributing

Pull requests are welcome. Please:

- Run `bun run typecheck && bun run lint && bun run test` before pushing
- Keep each addon self-contained — no imports from sibling addons
- Follow the module system rules documented in [lumi/AGENTS.md](https://github.com/lumi-devs/lumi/blob/main/AGENTS.md)

## License

[AGPL v3](LICENSE) © Lumi Developers
