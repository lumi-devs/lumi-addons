# dragme

Voice drag requests: ask to be pulled into a voice channel; anyone already
inside approves or declines with one click.

- `/dragme <channel>` — request to join a voice channel.
- Post a user mention/ID in the configured request channel — request to join
  wherever that user currently is.
- Accept moves the requester if they're in voice, otherwise grants a temporary
  connect pass (auto-revoked).
- `/dragme-admin active | clear` — moderator tooling.

Configure `request_channel_id`, `timeout_minutes`, `grace_minutes`, and
`blacklist_role_ids` via `/config`.
