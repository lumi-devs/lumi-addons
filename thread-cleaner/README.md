# Thread Cleaner

Automatically archives or locks threads after a configurable period of inactivity.

## How it works

When a thread is created under an enabled parent channel, Thread Cleaner records its cleanup deadline. Every message posted in a tracked thread pushes that deadline back, at most once per 60 seconds per thread. Every five minutes a sweep archives threads whose deadline has passed, or locks them and then archives them when the configured action is `lock`.

Each sweep processes every enabled guild and caps work per guild, so a busy server cannot crowd out cleanup in other servers. Tracking records are read in keyset pages, so guilds with more records than one page are fully scanned instead of only seeing the first page. Processed threads are removed from tracking immediately, so a thread is only cleaned up once. If a thread is deleted manually, its tracking record is removed. Missing threads and unknown-channel API errors are treated as stale and their records are discarded.

## Configuration

| Field | Default | Description |
| --- | --- | --- |
| Enabled parent channels | none | Channels whose threads are tracked. Threads under other channels are ignored. |
| Inactivity duration (minutes) | 4320 (3 days) | Minutes without a message before cleanup runs. |
| Cleanup action | `archive` | `archive` archives the thread. `lock` locks the thread, then archives it. |

The inactivity duration is read from the current configuration whenever a message extends a deadline. The cleanup action is captured when the thread is first tracked.

## Permissions and intents

Thread Cleaner needs the **Manage Threads** permission in the enabled parent channels and their threads. It uses the Guilds and GuildMessages gateway intents. Message content is never read or stored.

## Privacy

Thread Cleaner stores thread IDs, parent channel IDs, cleanup deadlines, and the chosen cleanup action in guild module storage. It does not store message content, user IDs, or other personal end-user data, so there is no user data export or deletion lifecycle.
