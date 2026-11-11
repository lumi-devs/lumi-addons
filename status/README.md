# Status Rotator

Owner-managed rotating bot presence. Statuses are configured per server and the
bot owner rotates them on a fixed interval.

## Commands

All commands are bot-owner only and must be run in a server.

| Command | Description |
| --- | --- |
| `/status add <text> [type] [presence]` | Add a rotating status. Up to 25 per server. |
| `/status remove <id>` | Delete a status by its id. |
| `/status list` | Paginated list with enabled state, interval, and cursor. |
| `/status interval <duration>` | Set the rotation interval. |
| `/status toggle` | Enable or disable rotation for this server. |
| `/status preview` | Apply the next status immediately. |

Activity types: `Playing`, `Watching`, `Listening`, `Competing`, `Custom`, and
`Streaming`. Online states: `online`, `idle`, `dnd`, and `invisible`. A
`Streaming` status uses its text as the activity URL when the text is an
`http(s)` link.

Durations use `s`, `m`, and `h` suffixes and may be combined, for example `30s`,
`5m`, `1h`, or `1h30m`. The minimum is 30 seconds and the maximum is 24 hours.

## Placeholders

`{guilds}` and `{users}` are resolved when a status is applied, using the bot's
current guild count and cached member total. The stored text keeps the
placeholders so the values stay live.

Status text is sanitized before saving: newlines and control characters are
removed, whitespace is collapsed, and the result is capped at 128 characters.

## Single-controller behavior

Presence is global, so only one server's rotation controls it at a time. Every
server with rotation enabled is a candidate; the candidate with the most recent
activation time wins. Enabling rotation, changing the interval while enabled,
or previewing while enabled refreshes that server's activation time and makes it
the controller. Other enabled servers keep their own cursor unchanged and do not
touch the bot presence until they become the controller.

Only servers where the module is enabled are rotation candidates. A cron task
runs once per minute and applies the next status for the controller only when
its `nextAt` timestamp is due. Because the task runs every minute, a
30-second interval still applies at most once per minute. The state record stores
the cursor and next run time, so restarts do not create duplicate rotation
chains.

## Scheduling and intents

The addon registers a one-minute cron task; no Discord gateway intents beyond the
standard set are required for setting presence. Remote status text is applied
with `client.user.setPresence`.

## Privacy

No end-user data is stored. The addon keeps only server-scoped status entries
(text, activity type, online state, id) and rotation state (enabled, interval,
cursor, activation and next-run timestamps, last applied id). There is no
`dataLifecycle` export or delete because nothing identifies a user.