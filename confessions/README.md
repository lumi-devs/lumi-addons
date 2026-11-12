# Confessions

Anonymous confessions for your server. Members run `/confess`, fill in a modal,
and the bot posts their message as a numbered card with no author name. Other
members can reply anonymously with `#N.k` numbering, either in a per-confession
thread or in the main channel.

## Anonymity model

Each server gets one random 32-byte salt, stored in the module's durable data.
An author is never stored by user ID. The only identity value saved on a
confession is:

```
SHA-256(salt + userId)
```

That hash exists solely so moderators can ban or unban the author of a numbered
confession. It is never shown in Discord messages, moderation logs, or command
output. There are no reversible identity keys, no raw user IDs, and no reply-DM
delivery. **Authors cannot be identified or direct-messaged by the bot.**

Cooldowns are kept in the cache as expiring entries keyed by that same hash.
Bans are stored as `ban:<hash>` records in durable data.

## How it works

- `/confess` opens an anonymous confession modal.
- The confession posts as **Confession #N** in the configured channel, with an
  optional image upload when images are enabled.
- With **Auto-Thread** enabled, a thread named `Confession #N` opens under the
  card. Replies post there as **Confession #N.k**. If the thread is unavailable,
  replies fall back to the confession channel.
- Each confession card has a **Reply anonymously** button, and a **Report**
  button when a Report Log Channel is configured. Reporting sends an anonymous
  report to that channel with the reporter, the confession number, and a jump
  link to the message. It never includes the author's identity, and each
  confession can only be reported once.
- The per-author cooldown throttles new confessions, not replies. The cooldown
  is claimed atomically before posting and released if posting or saving fails,
  so concurrent submissions cannot both succeed.
- A banned author cannot submit confessions or anonymous replies until a
  moderator unbans them by confession number.

## Setup

Configure the addon in `/lumi` -> **Modules** -> **Confessions**.

| Field | Default | Meaning |
|---|---|---|
| Confession Channel | - | Where confessions are posted. **Required.** |
| Moderation Log | - | Optional channel for moderation audit entries. |
| Report Log Channel | - | Optional channel that receives user-submitted reports. The Report button only appears when this is set. |
| Report Ping Role | - | Optional role shown (without pinging) in report messages. |
| Auto-Thread | on | Open a reply thread under each confession. |
| Allow Image Uploads | on | Allow an optional image upload on confessions and replies. |
| Cooldown (minutes) | 5 | Minimum gap between confessions from one author. `0` disables it. |

The bot needs **View Channel**, **Send Messages**, and **Attach Files** in the
confession channel. Uploaded images are rehosted to the moderation log channel
when one is configured, otherwise to the confession channel, so the bot also
needs those permissions there. Reports need the same permissions in the
configured report log channel. For auto-threads it also needs **Create Public
Threads** and **Send Messages in Threads**. Deleting confessions uses **Manage
Messages**, and removing their threads uses **Manage Threads**. No privileged
gateway intents are required.

## Commands

| Command | Permission | Description |
|---|---|---|
| `/confess` | Everyone | Open the anonymous confession modal. |
| `/confessions ban <number>` | `mod.*` + Manage Messages | Ban the anonymous author of a confession. |
| `/confessions unban [number] [hash]` | `mod.*` + Manage Messages | Lift that author's ban by confession number or 64-character author hash. |
| `/confessions delete <number>` | `mod.*` + Manage Messages | Delete the confession message and thread where possible. |
| `/confessions list` | `mod.*` | Paginated list of recent confession numbers with jump links. |

Moderation never reveals an author. The log channel records only the confession
number and action, never the author hash or any user identity. Ban and unban
resolve the author from the confession number, so that confession must still be
recorded; deleting a confession does not clear a ban.

## Data and erasure

Stored per server:

- the random salt and confession counter;
- per confession: number, channel/message/thread IDs, and the irreversible
  author hash;
- per confession reply counter;
- ban records keyed by author hash;
- per confession report markers holding only a timestamp.

Deleting a confession removes its metadata, number index, reply counter, and
its message and thread on a best-effort basis.

### GDPR limits

Because identity is one-way hashed and confessions are keyed by message ID, it
is not possible to look up a user's confessions from their user ID.
`deleteUserData` therefore computes the user's hash with the server's existing
salt and deletes only that hash's ban record and cooldown entry. It cannot and
does not remove confessions the user authored. This limitation is intentional:
keeping no reversible link is what makes the anonymity meaningful.
`exportUserData` reports only whether that user's hash is currently banned or
on cooldown, never the hash itself.
