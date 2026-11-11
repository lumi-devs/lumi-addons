# Booster Roles

Give server boosters a personal role they control. Owners can rename it, recolour it, share it with a few members, and delete it from an ephemeral panel. Roles are cleaned up automatically after a grace period when an owner stops qualifying.

## How it works

- Eligibility is native server boosting **or** any configured qualifying role. Blacklisted members are denied.
- A new role is created directly below the configured anchor role, assigned to the owner, and optionally announced in the showcase channel.
- Sharing assigns the same role to another member. Owners can unshare; shared members can renounce a role from their own panel.
- When an owner stops boosting or loses every qualifying role, the role enters a grace period. A sweep runs every 15 minutes and deletes expired roles, stripping them from every holder.
- Re-qualifying before expiry clears the grace period and restores the role to the owner and current share holders.
- The sweep also repairs drift: if the Discord role was deleted out of band, its records are removed; if the owner left the server or stopped qualifying, grace is applied.

## Setup

Configure through `/lumi` → **Modules** → **Booster Roles**.

| Field | Default | Meaning |
|---|---|---|
| Qualifying Roles | none | Additional roles that grant access. Native boosting always counts. |
| Anchor Role | none | New roles are placed directly below this role. |
| Showcase Channel | none | Optional channel that announces new roles. |
| Moderation Log | none | Optional channel that receives deletion and cleanup entries. |
| Max Shares | 3 | Maximum members an owner may share with (`0` disables sharing). |
| Grace Period (hours) | 24 | How long a role is kept after its owner stops qualifying (`0` deletes immediately). |
| Max Name Length | 32 | Maximum custom role name length. |

The bot needs **Manage Roles**, and its highest role must be above the anchor role and above any role it manages. Role names are length-checked and sanitized; colours accept hex values such as `#5865F2`, `#f2a`, or `0x5865F2`.

## Commands

- `/boosterrole` — open your personal panel. Owners can create, rename, recolour, share, manage shares, and delete. Shared members can renounce a role.
- `/boosterrole-admin stats` — role, share, grace, and blacklist totals. Requires the `roles.boosterroles` permit.
- `/boosterrole-admin blacklist add <user> [reason]` — block a member. Their owned role is deleted and they are removed from shares.
- `/boosterrole-admin blacklist remove <user>` — unblock a member.
- `/boosterrole-admin blacklist list` — list blocked members with pagination.
- `/boosterrole-admin force-delete <role> [reason]` — delete a role immediately.

All error and denial responses are ephemeral. Panels embed the invoking user ID in their custom IDs, and only that user can operate them.

## Permissions and intents

- User panel actions need no special server permission beyond eligibility.
- Administrator subcommands require the `roles.boosterroles` permit. Server managers may bypass permit enforcement according to your permit configuration.
- The bot must be able to view the showcase and log channels to send announcements.
- The module relies on the **GuildMembers** intent being enabled so member update events can detect boost and role changes.

## Privacy

Stored data per guild:

- One record per custom role: role ID, owner ID, shared member IDs, creation time, and grace deadline.
- One per-user index: role IDs the member owns or has been shared.
- Moderator blacklist entries: user ID, moderator ID, timestamp, and optional reason.

Data is deleted when a role is removed. GDPR export returns the user's index, blacklist entry, and related role records. GDPR deletion removes owned roles, strips the user from shares, deletes their index and blacklist entries, and returns counts.
