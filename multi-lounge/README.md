# Multi Lounge

Auto-scaling voice lounges. Pick one or more **base** voice channels; when every
lounge in a group fills up, Multi Lounge clones that group's base to add another,
and removes the extras once they empty — so there's always a spare and never a
wall of dead channels. Each base scales its own group independently.

## How it works

- Per base: when **every** lounge in the group (base + its extras) has at least
  the **busy threshold** users, a new lounge is cloned from that base (same
  category, permissions, bitrate, and user limit), named from the template at
  the lowest free number.
- When an extra lounge empties, it's removed. A base is never deleted.
- Numbering stays contiguous per group — gaps are filled by the next new lounge.
- A per-base creation cooldown prevents churn during rapid join/leave bursts.

## Setup

Configure via `/lumi` → **Modules** → **Multi Lounge**:

| Field | Default | Meaning |
|---|---|---|
| Base Lounges | — | Comma-separated voice channel IDs to clone. **Required.** |
| Busy Threshold | 2 | Users before a lounge counts as busy. |
| Max Extra Lounges | 5 | Cap on bot-created lounges **per base**. |
| Name Template | `Lounge {n}` | `{n}` is the lounge number. |
| Creation Cooldown | 10s | Minimum gap between creations. |

## Commands

- `/lounge stats` *(Moderator)* — live lounge occupancy plus lifetime
  created / removed / peak-concurrent counts.

## Notes

- Managed extra channels are tracked in module storage, so a restart never
  orphans a lounge; a background reconcile heals any drift every few minutes.
- Stores no per-user data.
