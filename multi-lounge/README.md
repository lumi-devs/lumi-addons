# Multi Lounge

Auto-scaling voice lounges. Pick one or more **base** voice channels; when every
lounge in a base's group (the base plus its managed extras) reaches the busy
threshold, Multi Lounge clones the base to open another lounge. Empty extras are
removed automatically, so busy groups gain capacity without leaving dead
channels behind. Each base scales independently.

## Behavior

- Every configured base starts its own group. The base channel is never deleted.
- When all lounges in a group have at least **Busy Threshold** users, a new
  extra is cloned from that base.
- Clones preserve the base's category, permission overwrites, bitrate, user
  limit, and voice region when one is set.
- Extra names come from **Name Template**; `{n}` is replaced with the lounge
  number. Numbers stay contiguous per group, so gaps left by removed lounges are
  filled first.
- An extra is deleted once it has no members. Bases are ignored by cleanup.
- A per-base **Creation Cooldown** prevents rapid create/delete churn.
- Extra channels are tracked in module storage. A reconcile task runs every five
  minutes to remove empty or missing channels, heal stale state, and clean up
  groups whose base channel or configuration disappeared.
- The bot only acts on channels in the configured groups; other voice channels
  are never touched.

## Setup

Install and enable **Multi Lounge**, then open the module settings and configure:

| Field | Default | Meaning |
|---|---|---|
| Base Lounges | — | Voice channels to auto-scale. At least one is required. |
| Busy Threshold | 2 | Users needed before a lounge counts as busy. |
| Max Extra Lounges | 5 | Maximum managed extras per base. |
| Name Template | `Lounge {n}` | Name for new lounges; `{n}` is the lounge number. |
| Creation Cooldown | 10s | Minimum gap between creations for one base. |

A typical setup uses a single empty base channel such as `Lounge`. When it fills
to the threshold, a `Lounge 2` is created; when extra lounges empty, they are
removed.

## Command

`/lounge stats` shows live occupancy for every configured base and its extras,
plus lifetime created, removed, and peak-concurrent counters.

## Permissions

- The bot needs **Manage Channels**, **View Channels**, and **Connect** in the
  affected channels and category. Clone creation also needs the category and
  base channel to be visible to the bot.
- `/lounge stats` requires the `mod.*` permit and Discord's **Manage Server**
  permission. Errors and denials are ephemeral.
- The bot's gateway configuration must include voice state events; the host
  enables this by default.

## Privacy

Multi Lounge does not store user identities. Durable state contains only managed
voice channel IDs, lounge numbers, and aggregate counters. Cooldowns live in the
shared cache and expire automatically.