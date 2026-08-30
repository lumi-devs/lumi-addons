---
title: Multi Lounge
description: Auto-scaling dynamic voice channels that clone on demand and clean up when empty.
emoji: "🛋️"
category: "Addons"
tags: ["dynamic-vc", "auto-scale", "voice"]
---

**Multi Lounge** provides self-scaling dynamic voice channels. When all voice lounges in a category fill up, a new lounge is automatically created. When extras empty, they are cleanly deleted while keeping channel numbering contiguous.

## Installation

```sh
,download lumi-addons multi-lounge
/modules enable multi-lounge
```

## Configuration Schema

- `base_channel_ids`: List of primary base voice channel IDs.
- `busy_threshold`: Number of users in a lounge before it counts as busy (default `2`).
- `max_extra_lounges`: Maximum number of extra cloned lounges created per base (default `5`).
- `name_template`: Naming pattern for created lounges, e.g. `Lounge {n}`.
- `cooldown_seconds`: Anti-churn delay between clone operations (default `10s`).

## Commands

### `/lounge create base:#voice-channel`
Registers a voice channel as a multi-lounge base.

### `/lounge list`
Lists all active base lounges and currently scaled clones.
