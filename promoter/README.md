# promoter

Auto-role for members who advertise the server — either in their Discord custom
status or by wearing the server's **native server tag** next to their name.

- **Two signals:** a match on any `match_terms` in the custom status, **or** the
  member displaying this server's tag (`detect_server_tag`, on by default). Either
  one grants the role; losing both removes it.
- Live: `presenceUpdate` grants/revokes as statuses change. Server-tag changes
  arrive on the next self-heal sweep (they don't fire a presence event).
- Self-heal: periodic sweep (per-guild `sweep_interval_minutes`) catches missed
  events. Members whose status we can't read (offline) are never revoked just for
  being unreadable — but in tag-only mode, where the tag is readable even offline,
  revocation still applies.
- `/promoter panel` (admin) — persistent info card with a "Check my status" button.
- `/promoter stats` (mod) — all-time grant/revoke counters.

Requires the **Presence** privileged intent. Configure `promoter_role_id`,
`match_terms`, `detect_server_tag`, `log_channel_id`, and `sweep_interval_minutes`
via `/lumi` → **Modules** → **Promoter**.
