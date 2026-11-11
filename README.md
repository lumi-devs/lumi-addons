# Lumi Addons

First-party addons for [Lumi v2](https://github.com/lumi-devs/Lumi). Every top-level directory is an independent module installed and hot-loaded by Lumi's downloader at runtime.

## Addons

| Addon | Category | What it does |
| :--- | :--- | :--- |
| `activity-roles` | Roles | Grants roles based on a member's activity or custom status. |
| `booster-roles` | Roles | Gives server boosters a personal, customizable role with sharing. |
| `confessions` | Community | Anonymous confessions with replies, cooldowns, and author bans. |
| `dragme` | Voice | Request to be pulled into a voice channel, approved by someone inside. |
| `economy-games` | Economy | Blackjack, roulette, crime, work/beg/fish/mine, and a shop. |
| `multi-lounge` | Voice | Auto-scaling temporary voice lounges with contiguous numbering. |
| `promoter` | Roles | Auto-role for members advertising the server in status or server tag. |
| `rolementions` | Moderation | Role mention analytics and timed mention protection. |
| `status` | Utility | Owner-managed rotating bot presence. |
| `thread-cleaner` | Moderation | Archives or locks inactive threads automatically. |
| `utility` | Utility | Emoji stealing and text translation. |

## Install

In a server with Lumi v2:

1. Run `/lumi` → **Add-ons** → **Repositories** → **Add Repository** and enter
   `https://github.com/lumi-devs/lumi-addons`.
2. Browse the repository and install the addon by its module name.

Installed addons appear in the dashboard's **Add-ons** tab, where they can be enabled, configured, updated, and pinned.

## Development

Requires Bun 1.4.2+ and a local Lumi v2 checkout on `v2/develop`.

```bash
# Lumi v2 dependencies, in ../lumi-v2
(cd ../lumi-v2 && nix develop --command sh -c 'bun install && bun run db:generate')

# in this repo
nix develop --command bun run setup
nix develop --command bun run validate
nix develop --command bun run typecheck
nix develop --command bun run lint
nix develop --command bun run test
```

`bun run setup` links `.lumi` and `node_modules` to the Lumi checkout. Set `LUMI_PATH` if the checkout is elsewhere.

## Adding an addon

Create a top-level directory named after the module, add `manifest.json` and `index.ts`, and follow [AGENTS.md](./AGENTS.md). The module name MUST match the directory name. Addons are flat: no nested modules, no cross-addon imports.

## License

AGPL-3.0-only.
