# status

Owner-managed rotating bot presence.

- `/status add <text> [type] [presence]` - placeholders: `{guilds}`, `{users}`
- `/status remove <id>` · `/status list` · `/status interval <duration>` · `/status toggle` · `/status preview`

All commands require `admin.status` permission level. Entries and rotation
state are scoped per server: one kv list (`entries`) plus one kv cursor
(`state`: queue, last id, next run, interval, on/off, pending schedule).

Scheduling is timestamp-guarded (`scheduledForMs`), so hot-reloads start no duplicate
chains - kickstart happens on module load, command mutations, or task fire.
