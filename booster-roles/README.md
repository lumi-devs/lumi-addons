# Booster Roles

Give your server boosters a personal role they fully control — their own name
and colour, plus the ability to share it with a few friends — all from one
interactive, ephemeral panel. When a boost lapses, the role is cleaned up
automatically after a grace period.

## How it works

- `/boosterrole` opens a private panel. Eligible members can **Create** a role,
  then **Rename**, **Recolour**, **Share**, **Manage Shares**, or **Delete** it.
- Eligibility = native Discord boost status **or** any of the configured
  qualifying roles. Blacklisted members are locked out.
- Created roles are placed just beneath a configurable **anchor** role and
  assigned to the owner. New roles can be announced in a **showcase** channel.
- Sharing grants the same role to another member (up to a configurable limit);
  unsharing or renouncing removes it from them.
- **Grace period:** when an owner stops boosting, a one-shot cleanup job is armed
  for the configured number of hours. If they re-boost in time, it's cancelled;
  otherwise the role is deleted and stripped from everyone. A 12-hour reconcile
  sweep heals any drift (owner left, role deleted out-of-band, missed events).

## Setup

Configure via `/lumi` → **Modules** → **Booster Roles**:

| Field | Default | Meaning |
|---|---|---|
| Qualifying Roles | — | Comma-separated role IDs that grant access. Empty = native boost only. |
| Anchor Role | — | Created roles sit just below this role. |
| Showcase Channel | — | Optional; announces new roles. |
| Moderation Log | — | Optional; deletion / cleanup audit. |
| Max Shares | 3 | How many others an owner can share with. |
| Grace Period (hours) | 24 | Delay after a boost lapses before deletion. |
| Max Name Length | 32 | Longest allowed role name. |

## Commands

- `/boosterrole` — open your personal role panel.
- `/boosterrole-admin stats` *(Admin)* — role / share / blacklist totals.
- `/boosterrole-admin list` *(Admin)* — every custom role and owner.
- `/boosterrole-admin info <user>` *(Admin)* — one member's role details.
- `/boosterrole-admin delete <user> [reason]` *(Admin)* — delete a member's role.
- `/boosterrole-admin blacklist <add|remove|list> [user] [reason]` *(Admin)* —
  manage who may use custom roles.

## Privacy & data

- Stores per guild: one record per owner (role id, name, colour, share list) and
  blacklist entries.
- Implements GDPR erasure: deleting a user drops their role record, blacklist
  entry, and their id from every other owner's share list across all guilds.
