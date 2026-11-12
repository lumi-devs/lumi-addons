# 🛡️ Role Mentions

Role mention analytics and timed mention protection for Lumi v2.

## What it does

- Counts role mentions per role per UTC day and shows the day's most-mentioned roles.
- Makes protected roles temporarily non-mentionable when they are mentioned.
- Restores roles automatically when their block expires, with a one-minute sweep that also repairs drifted role state.
- Logs block and restore events to a configured channel with mentions suppressed.

## Setup

1. Enable the module for the server.
2. Set a **Log Channel** for protection events.
3. Add roles to **Protected Roles**, either in the module config or with `/rolementions protect`.
4. Adjust **Auto Block Minutes** if the default 60-minute block is not suitable.
5. Keep **Analytics Enabled** on unless per-role mention counts are not wanted.

### Configuration

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `logChannelId` | Channel | None | Channel where mention blocks and restorations are logged. |
| `protectedRoleIds` | Role list | Empty | Roles temporarily made non-mentionable when mentioned. Each role may set its own `autoBlockMinutes` override. |
| `autoBlockMinutes` | Number | `60` | Default minutes a protected role stays non-mentionable after a mention; per-role overrides win when set. |
| `analyticsEnabled` | Boolean | `true` | Count role mentions per UTC day. Disable to skip analytics entirely. |

## Commands

Analytics subcommands (`stats`, `top`) require the `mod.rolementions` permit;
`admin.rolementions` also grants access. Configuration-changing subcommands
(`list`, `reset`, `protect`, `unprotect`, `block`, `unblock`) require
`admin.rolementions` only. All subcommands run inside a server.

| Command | Description |
| --- | --- |
| `/rolementions stats [role]` | Show today's top mentioned roles, or one role's daily counts. Paginated. |
| `/rolementions top [limit]` | Show the most mentioned roles today (1-25). |
| `/rolementions list` | List protected roles and active blocks. |
| `/rolementions reset` | Clear today's mention counters. |
| `/rolementions protect <role> [minutes]` | Add a role to the protected list; `minutes` sets a per-role auto-block duration override. |
| `/rolementions unprotect <role>` | Remove a role from the protected list. |
| `/rolementions block <role> <minutes>` | Temporarily make a role non-mentionable now. |
| `/rolementions unblock <role>` | Restore a blocked role before its block expires. |

## Permissions and intents

- The bot needs **Manage Roles**. Every role mutation checks this permission and verifies the role is below the bot's highest role.
- The bot needs **View Channel** and **Send Messages** in the configured log channel.
- The `@everyone` role and integration-managed roles are skipped.
- Reading role mentions requires the **Message Content** intent.
- The addon does not set `defaultMemberPermissions`; analytics accept
  `mod.rolementions` or `admin.rolementions`, while protection changes require
  `admin.rolementions`.
- Log messages use `noPingCard`, and roles are listed by name and ID rather than as pings.

## Analytics retention and privacy

- Mention analytics are aggregate counters keyed by role ID and UTC date (`mentions:<YYYY-MM-DD>`). They are stored with a 48-hour TTL.
- Only per-role counts are stored. Message content, message IDs, author IDs, and other user data are never stored.
- Block records contain only role IDs, role names, an expiry timestamp, and the role's previous mentionable state.
- Because no user data is stored, the module does not need a user-data export or deletion lifecycle.

## Notes

- A protected role is blocked only when it is mentionable. If it is already non-mentionable, no block is created.
- Existing blocks are not extended by further mentions; they expire on their original schedule.
- The one-minute sweep restores expired blocks, clears blocks for deleted roles, and re-applies an active block if its role was made mentionable again.
- Unprotecting a role stops future automatic blocks but does not cancel an active block. Use `/rolementions unblock` for that.