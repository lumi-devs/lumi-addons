# promoter

Auto-role for members who advertise the server in their Discord custom status.

- Live: `presenceUpdate` grants/revokes as statuses change.
- Self-heal: periodic sweep (per-guild `sweep_interval_minutes`) catches missed
  events. Invisible/offline members are never revoked just for being unreadable.
- `/promoter panel` (admin) — persistent info card with a "Check my status" button.
- `/promoter stats` (mod) — all-time grant/revoke counters.

Requires the **Presence** privileged intent. Configure `promoter_role_id`,
`match_terms`, `log_channel_id`, `sweep_interval_minutes` via `/config`.
