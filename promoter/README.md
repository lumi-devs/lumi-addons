# Promoter

Auto-role for members who advertise the server. Members earn the configured
promoter role by matching a term in their custom status, by wearing this
server's native tag, or both. The role is removed when neither signal remains.

## How it works

- **Custom status** — any configured match term found in the member's custom
  status text grants the role. Matching is case-insensitive and ignores
  surrounding whitespace in terms.
- **Server tag** — when `Detect Server Tag` is on, displaying this server's
  native tag grants the role too.
- **Live updates** — `presenceUpdate` grants and revokes immediately as custom
  statuses change.
- **Self-heal sweep** — server-tag changes do not always emit a presence update,
  so a periodic sweep reconciles members at the configured interval (default 10
  minutes). It also recovers drift from missed events.
- **Offline members** — an offline member's custom status cannot be read, so
  the role is not revoked just because they are offline. The exception is
  tag-only setups (no match terms, tag detection enabled), where the tag is
  still readable offline and normal revocation applies.
- **Manual roles are respected** — the module stores which members it granted
  the role to. A role assigned by staff or another bot is never removed by this
  module.

## Setup

Configure the module in `/lumi` → **Modules** → **Promoter**.

| Field | Purpose |
| --- | --- |
| `Promoter Role` | Role granted to qualifying members. Required. |
| `Match Terms` | Phrases to find in custom status text. |
| `Detect Server Tag` | Also qualify members wearing this server's tag. Default on. |
| `Log Channel` | Channel for grant and revoke cards. Optional. |
| `Sweep Interval` | Minutes between self-heal sweeps. Default 10. |

The bot needs:

- the **Presence** privileged intent (Presence Intent), enabled in the Discord
  Developer Portal and in the bot's host configuration;
- **Manage Roles**;
- a role position above the promoter role.

The module skips role changes when the bot cannot manage the configured role.

## Commands

| Command | Permission | Description |
| --- | --- | --- |
| `/promoter panel` | Manage Server or `admin.promoter` | Posts a persistent info card with a **Check my status** button. |
| `/promoter stats` | Manage Server or `mod.promoter` | Shows all-time grant and revoke totals. |

The status check button is self-scoped: any member can press it and only sees
their own result. It also reconciles their role immediately when their status is
readable.

Grant and revoke log cards mention the member without pinging anyone.

## Privacy

The module stores one durable record per member who was granted the role:
the grant timestamp and the signal reason (`custom status`, `server tag`, or
both). Guild-wide `grants` and `revokes` counters are also stored. Custom status
text is read live from presence data for matching and is never persisted.

Deleting a user's data removes that member's promoter grant record. Guild-wide
counters contain no user identifiers.
