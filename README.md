# lumi addons

> Dynamic, drop-in modules for the [Lumi Discord Bot](https://github.com/lumi-devs/lumi).

A curated collection of hot-loadable modules to enhance your server. Sandboxed, zero-downtime, and instantly configurable via `/config`.

## catalog

* `activity-roles` — Assign roles based on rich presence
* `booster-roles` — Manage custom booster roles and grace periods
* `confessions` — Anonymous confessions with thread support
* `dragme` — Consent-based voice drag requests
* `multi-lounge` — Auto-scaling, dynamic voice channels
* `promoter` — Reward members for server tags in their custom status
* `rolementions` — Mention tracking and sensitive role protection
* `status` — Global rotating bot presence manager
* `thread-cleaner` — Auto-archive and lock inactive threads
* `utility` — Essential utilities (translations, emoji stealing)
* `verify` — Captcha verification with timeout handling

## usage

Lumi features a built-in module manager. Installation requires no restarts.

```bash
# Add the repository
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git

# Install a module
,download lumi-addons <module>
```

## dev

```bash
git clone https://github.com/lumi-devs/lumi ../lumi
bun run setup
bun run typecheck
bun run lint
```

---
GPL-3.0 © Lumi Developers
