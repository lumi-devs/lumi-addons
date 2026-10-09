# status

Owner-managed rotating bot presence.

- `/status add <text> [type] [presence]` — placeholders: `{guilds}`, `{users}` (live cluster totals from `clientStats`)
- `/status remove <id>` · `/status list` · `/status interval <duration>` · `/status toggle` · `/status preview`

All commands require **bot owner** permission level. Entries and rotation
state are scoped per server: one kv list (`entries`) plus one kv cursor
(`state`: queue, last id, next run, interval, on/off, pending schedule).

Every stimulus converges the same state: the five guild-scoped events
(`presenceUpdate`, `voiceStateUpdate`, `guildMemberUpdate`, `messageCreate`,
`threadCreate`), every command mutation, and the per-guild `status:rotate`
tick, which reschedules itself with its own interval. Scheduling is
timestamp-guarded (`scheduledForMs`), so hot-reloads start no duplicate
chains — kickstart only happens from command/event/task paths.

## Limitations

- `{shard}` is not supported: the sandbox exposes no shard id, so unknown
  tokens are left untouched.
- `userUpdate` carries no guild scope, so it is not subscribed.
