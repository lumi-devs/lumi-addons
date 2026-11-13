# Confessions

Anonymous confessions for your server. Members run `/confess`, fill in a modal
with an optional title, and the bot posts their message as a card with no author
name. Other members can reply anonymously in a per-confession thread or in the
main channel, including replying to replies.

## Anonymity model

Each server gets one random 32-byte salt, stored in the module's durable data.
Public-facing identity is never stored: confession and reply cards carry no
author name, and the author hash saved for moderation is:

```
SHA-256(salt + userId)
```

That irreversible hash exists solely so moderators can ban or unban the author
of a numbered confession. It is used in moderation audits, which are only sent
to the configured Moderation Log channel, never to public channels.

Raw user IDs are stored for two things only:

1. delivering reply DM notifications, and
2. remembering who asked to stop receiving those DMs.

Both are erased by the module data-deletion request. Authors are otherwise not
identifiable from public messages.

Cooldowns are kept in the cache as expiring entries keyed by the author hash.
Bans are stored as `ban:<hash>` records in durable data.

## How it works

- `/confess` opens an anonymous confession modal with an optional **Title**
  (100 characters) and the confession text. The newest confession card also
  carries a **Make a Confession** button, which moves along as new confessions
  post.
- The confession posts with the title as its heading, or **Confession #N** when
  no title is given. The footer always shows the confession number.
- With **Auto-Thread** enabled, a thread named `Confession #N` opens under the
  card. Replies post there. If the thread is unavailable, replies fall back to
  the confession channel.
- Reply cards are kept clean: they show a quote of the parent when replying to a
  reply and use Discord's native reply reference, but never display numbering.
  Hierarchical numbering (`1.1`, `1.1.1`) appears only in the moderation log,
  report cards, and the ephemeral confirmation messages.
- A reply author who is the confession's own author is marked with a **👑 OP**
  footer and a gold side panel.
- Each confession card and each reply card has a **Reply** button. Replying to a
  reply targets that reply's author (native message reference plus a quote), not
  the root confession.
- Each card also has a **Report** button when a Report Log Channel is configured.
  Reporting sends an anonymous report to that channel with the reporter, the
  confession or reply path, and a jump link. It never includes the author's
  identity, and each card can only be reported once.
- When **Reply DM Notifications** is enabled, the parent author gets a DM with a
  jump link. The DM includes a **Stop these DMs** button; the preference is per
  server and reversible.
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
| Moderation Log | - | Optional channel for moderation audits and actions. |
| Report Log Channel | - | Optional channel that receives user-submitted reports. The Report button only appears when this is set. |
| Report Ping Role | - | Optional role shown (without pinging) in report messages. |
| Auto-Thread | on | Open a reply thread under each confession. |
| Allow Image Uploads | on | Allow an optional image upload on confessions and replies. |
| Reply DM Notifications | on | DM the parent author when someone replies to them. |
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
| `/confessions delete <number>` | `mod.*` + Manage Messages | Delete the confession, its thread, and stored reply records where possible. |
| `/confessions list` | `mod.*` | Paginated list of recent confession numbers with jump links. |

Moderation never reveals an author publicly. The moderation log records the
confession or reply path, the action, and the irreversible author hash for
audits; ban and unban resolve the author from the confession number, so that
confession must still be recorded. Deleting a confession does not clear a ban.

## Data and erasure

Stored per server:

- the random salt and confession counter;
- per confession: number, title, text, image URL, channel/message/thread IDs,
  and the irreversible author hash;
- per reply: hierarchical path (`1.1`, `1.1.1`), parent path, message/channel
  IDs, text, image URL, and the irreversible author hash;
- author user IDs for reply DM delivery, and per-user DM opt-out markers;
- ban records keyed by author hash;
- per confession and per reply report markers holding only a timestamp.

Deleting a confession removes its metadata, number index, reply records, reply
counters, and its message and thread on a best-effort basis.

### GDPR limits

Because identity is one-way hashed and confessions are keyed by message ID, it
is not possible to look up a user's confessions from their user ID.
`deleteUserData` computes the user's hash with the server's existing salt,
deletes that hash's ban record and cooldown entry, clears the raw user ID links
stored for reply DMs, and removes the DM opt-out preference. It cannot and does
not remove the confessions themselves. This limitation is intentional: keeping
no reversible link on hosted content is what makes the anonymity meaningful.
`exportUserData` reports whether that user's hash is currently banned or on
cooldown, never the hash itself.
