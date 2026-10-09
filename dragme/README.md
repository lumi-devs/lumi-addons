# dragme

Voice drag requests: ask to be pulled into a voice channel; anyone already
inside approves or declines with one click.

- `/dragme <user> <channel>` — request to join a voice channel. The user must
  be in that channel right now.
- Accept moves the requester straight into the channel.

Configure `request_channel_id`, `timeout_minutes`, and `blacklist_role_ids`
via `/config`.
