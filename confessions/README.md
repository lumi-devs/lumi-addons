# Confessions

Anonymous confessions for your server. Members run `/confess`, type into a modal,
and the bot posts it as a numbered card - no name attached. Anyone can reply
anonymously from a button, optionally inside a per-confession thread. Moderators
can ban a confession's author or delete a confession without ever learning who
wrote it.

## Anonymity

Authors are never stored in the clear. Each guild gets a random 32-byte salt; an
author is only ever recorded as `SHA-256(salt : userId)` for bans and cooldowns.
Reply-DM delivery needs the real user ID, so author links are stored sealed with
`AES-256-GCM` and opt-outs as `HMAC(key, userId)` - a database leak reveals no
usable user IDs. The module mints its own 32-byte key on first use and keeps it
in `data/confessions/seal.key` (mode 0600, outside the database, never
committed); override the directory with `CONFESSIONS_DATA_DIR`. Back it up with
the volume - lose it and sealed rows stop resolving.

## How it works

- `/confess` opens a modal; the confession is posted as **Confession #N** in the
  configured channel.
- With **Auto-Thread** on, a thread opens under each confession; anonymous
  replies land there as **#N.k**. With it off, replies post in the main channel.
- A per-author cooldown throttles submissions.
- Banning an author (by confession number) blocks all future confessions and
  replies from that hash until unbanned.

## Setup

Configure via `/lumi` -> **Modules** -> **Confessions**:

| Field | Default | Meaning |
|---|---|---|
| Confession Channel | - | Where confessions are posted. **Required.** |
| Moderation Log | - | Optional audit channel for bans / deletes. |
| Auto-Thread | on | Open a reply thread under each confession. |
| Allow Image URLs | on | Permit an optional image URL on confessions/replies. |
| Cooldown (minutes) | 5 | Minimum gap between an author's confessions. |

## Commands

- `/confess` - submit an anonymous confession.
- `/confessmod ban <number>` *(Moderator)* - ban a confession's anonymous author.
- `/confessmod unban <number | hash>` *(Moderator)* - lift a ban.
- `/confessmod list` *(Moderator)* - list banned author hashes.
- `/confessmod delete <number> [reason]` *(Moderator)* - remove a confession and its thread.

## Privacy & data

- Stores per guild: the salt, a confession counter, per-confession metadata
  (number, message/thread IDs, **author hash**), per-reply author hashes, ban
  records, sealed author links (AES-256-GCM) plus their HMAC index rows for
  reply-DM delivery, and HMAC'd DM opt-outs.
- Implements GDPR erasure: deleting a user drops their ban, cooldown, authored
  confessions, and reply rows across every guild.
