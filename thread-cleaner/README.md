# Thread Cleaner

Keeps thread clutter under control two ways: an **automatic** per-thread archive/
lock after inactivity, and an **admin bulk sweep** of all existing threads.

## Automatic cleanup

When a thread is created under one of the `enabled_channels`, a one-shot job is
scheduled for `inactive_duration` later (e.g. `24h`, `3d`, `1w`). When it fires,
the thread is archived or locked per the `action` setting. The job is persisted
in Redis (stable jobId per thread), so it survives restarts and is idempotent.

## Bulk sweep — `/thread-cleaner sweep` *(Admin)*

Processes **every existing thread** (active *and* archived) in scope, behind a
confirmation prompt:

| Option | Default | Effect |
|---|---|---|
| `min_messages` | 1 | Threads with this many messages or fewer are **permanently deleted**. |
| `scope` | enabled | `enabled` = only `enabled_channels`; `all` = every channel. |
| `strip_members` | off | Also removes added members from the threads that survive (non-archived only). |

The sweep runs as a background job and posts a summary card (scanned / deleted /
kept / stripped / failed) to the channel it was launched from. Deletion is
irreversible — the confirmation step spells that out. Bounded to 5,000 threads
per run for safety.

## Config

Set via `/lumi` → **Modules** → **Thread Cleaner**: `enabled_channels`,
`inactive_duration`, `action` (archive | lock).
