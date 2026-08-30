---
title: Confessions
description: Anonymous confessions channel with numbered cards, threaded replies, and cryptographic moderation.
emoji: "🕊️"
category: "Addons"
tags: ["anonymous", "threads", "community", "moderation"]
---

**Confessions** enables an anonymous confession board in your Discord server. Members submit confessions via a modal button or `/confess`, which are posted as beautifully formatted numbered cards with optional threaded replies.

## Installation

```sh
,download lumi-addons confessions
/modules enable confessions
```

## Key Features

- **Component-v2 Cards**: Clean embed-free message cards with interactive &ldquo;Reply&rdquo; and &ldquo;Report&rdquo; buttons.
- **Anonymous Replies**: Members and the original confession author (flagged with a 👑 OP badge) can reply anonymously.
- **Cryptographic Moderation**: Author identities are transformed into one-way salt hashes per guild. Moderators can ban serial abusers (`/confessmod ban`) and delete offending confessions without anyone ever seeing the author's real user ID.
- **Attachment Support**: Optional image attachment uploads via Discord modals.

## Commands

### `/confess`
Submit an anonymous confession modal.

### `/confessmod ban hash:<author_hash>`
Ban an author hash from posting confessions.

### `/confessmod delete number:<id>`
Delete a confession and all associated replies.
