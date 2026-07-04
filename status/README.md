# status

Owner-managed rotating bot presence.

- `/status add <text> [type] [presence]` — placeholders: `{guilds}`, `{users}`, `{shard}`
- `/status remove <id>` · `/status list` · `/status interval <duration>` · `/status toggle` · `/status preview`

All commands require **bot owner** permission level. Entries and settings are
global (presence is bot-wide), stored in module KV under the `global` scope.

## Limitation

Presence updates ride the gateway WebSocket, so rotation takes effect on the
`monolith` role (the default `docker compose up` topology). On a split
gateway/worker deployment the worker has no WS and the rotation is a no-op;
gateway-side presence relay is future work.
