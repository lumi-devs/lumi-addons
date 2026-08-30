---
title: Status Rotator
description: Global rotating bot presence with activity types, online states, and live dynamic placeholders.
emoji: "🔁"
category: "Addons"
tags: ["presence", "branding", "owner", "status"]
---

**Status Rotator** lets the bot owner manage a dynamic rotating presence schedule across the entire bot fleet.

## Installation

```sh
,download lumi-addons status
/modules enable status
```

## Key Features

- **Activity Types**: Supports `Playing`, `Streaming`, `Listening`, `Watching`, `Competing`, and `Custom`.
- **Dynamic Placeholders**:
  - `{guilds}`: Total guilds across all shards.
  - `{users}`: Total cached member count.
  - `{shards}`: Number of active gateway shards.
  - `{version}`: Bot software version.
- **Rotation Interval**: Fully configurable delay between status switches (default 60s).

## Commands

### `/status add type:Listening name:"{guilds} servers" status:Online`
Adds a new presence entry to the rotation pool.

### `/status list`
Lists all configured rotation statuses.

### `/status remove id:<index>`
Removes a status from the rotation.
