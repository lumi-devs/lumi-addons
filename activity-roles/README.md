# Activity Roles

Presence-based role automation for Lumi. Activity Roles grants a role while a member's Discord presence matches a rule and removes it when no rule matches anymore. Revocation is additive-only: the add-on only removes roles it granted itself, so manually assigned roles are never stripped.

## Features

- Activity types: Playing, Streaming, Listening, Watching, Custom status, and Competing.
- Each rule maps an activity type plus a case-insensitive substring to a role.
- Matches activity name, details, state, and custom status text.
- One role may be covered by several rules; it stays while any matching rule remains.
- Live updates from presence changes, member updates, joins, and leaves.
- A reconciliation sweep runs every ten minutes to repair missed events.
- Rules are cached in memory for 30 seconds and invalidated immediately on changes.

## Commands

All subcommands require the `mod.*` permit.

| Command | Description |
|---|---|
| `/activityroles add <type> <match> <role>` | Create or update a rule. Replaces the role if the same type and match already exist. |
| `/activityroles remove <type> <match>` | Delete a rule. |
| `/activityroles list` | Show all rules, paginated. |
| `/activityroles check [member]` | Show the member's current activities, matched rules, roles matching now, and roles granted by this add-on. Defaults to yourself. |

## Permissions and intents

- The bot needs **Manage Roles**.
- Roles assigned by this add-on must sit **below the bot's highest role**. Roles above the bot, managed roles, and `@everyone` are rejected with an explanation.
- The bot skips bots and members it cannot manage. A failed role edit never stops the remaining updates.
- The privileged **Presence Intent** (Server Members Intent is recommended too) must be enabled for the application in the Discord Developer Portal. Without the Presence Intent the bot receives no activities, so rules cannot match and `check` reports that presence is not visible.

## Privacy

- Stores one record per member and server containing only the role IDs this add-on granted, keyed by user ID so they can be revoked safely.
- Stores guild-scoped rules (activity type, match text, role ID).
- Does not store message content or activity history.
- GDPR deletion removes the member's granted record across servers along with any other record keyed to that user.
