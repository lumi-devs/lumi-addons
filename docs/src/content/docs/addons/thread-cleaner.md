---
title: Thread Cleaner
description: Automatically archive and lock inactive threads, plus bulk sweep tools for channels.
emoji: "🧹"
category: "Addons"
tags: ["threads", "cleanup", "bulk-sweep", "moderation"]
---

**Thread Cleaner** keeps forum channels and active thread lists tidy by automatically archiving or locking threads after a configurable period of inactivity.

## Installation

```sh
,download lumi-addons thread-cleaner
/modules enable thread-cleaner
```

## Key Features

- **Automated Archiving / Locking**: Schedules one-shot BullMQ cleanup tasks whenever a thread is created or receives a message.
- **Bulk Channel Sweep**: Moderator tooling to instantly archive or lock all stale threads across selected channels in one pass.

## Commands

### `/threadsweep channel:#forum-channel action:archive older_than:7d`
Performs an instant bulk cleanup of all stale threads in a channel.
