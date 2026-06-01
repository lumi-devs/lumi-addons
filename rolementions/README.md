# Role Mentions

Tracks every role mention in your server and can automatically **block** mentions of sensitive roles to stop ping spam — using native Discord AutoMod rules.

## Features

- **Daily mention tracking** — per-role counters that reset at 00:00 UTC.
- **Auto-protection** — mark a role as protected; the next time it's pinged, Ember blocks further mentions of it for a set duration via a managed AutoMod rule.
- **Manual blocks** — block/unblock a role on demand.
- **Activity logging** — mention activity and protection events post to a configurable log channel (mentions are never re-pinged).

## Install

```
,download install <repo> rolementions
```

Enable it for your server with `/config` (Role Mentions → enable), or `/module enable rolementions`.

> The bot needs the **Manage Server** permission to create and update the AutoMod rule.

## Configuration

Set these via `/config`:

| Field | Description | Default |
|---|---|---|
| **Log Channel** | Channel for mention/protection logs. | *(none)* |
| **Auto-Protect** | Auto-block protected roles when pinged. | `on` |
| **Default Protection (minutes)** | Fallback block duration when a protected role has none set. | `120` |

## Commands

These are **prefix** commands (use your server's bot prefix, e.g. `,`).

### `rm` / `rmention` / `rmentions` — *Moderator*

- `rm stats [role]` — today's mention counts (all roles, or one). *(default)*
- `rm top [limit]` — most-mentioned roles today (1–25).
- `rm reset` — clear today's counters. *(Admin)*

### `rp` / `rprotect` — *Admin*

- `rp add <role> [duration]` — protect a role (auto-block on mention).
- `rp remove <role>` — stop protecting a role.
- `rp list` — show protected roles and active blocks. *(default)*
- `rp block <role> [duration]` — block a role's mentions right now.
- `rp unblock <role>` — lift an active block early.

`duration` accepts `90m`, `2h`, `1d`, or a bare number of minutes.

## How it works

- **Counters** live in Redis under a per-day key, so they roll over automatically.
- **Protected-role config** is stored durably in Postgres (the shared `ModuleData` table — no migration needed).
- **Active blocks** live in Redis; each schedules a one-shot expiry job that lifts the block and updates the AutoMod rule when it elapses.
- Only the raw mention form `<@&id>` is added to the AutoMod keyword filter, so plain text containing a role's *name* is never blocked.
