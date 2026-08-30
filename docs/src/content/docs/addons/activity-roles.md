---
title: Activity Roles
description: Assign roles automatically based on members' Discord Rich Presence activity.
emoji: "🎮"
category: "Addons"
tags: ["roles", "presence", "gaming", "spotify"]
---

**Activity Roles** automatically grants and removes roles based on what members are doing on Discord — Playing games, Streaming on Twitch/YouTube, Listening to Spotify, Watching movies, or Custom statuses.

## Installation

```sh
,download lumi-addons activity-roles
/modules enable activity-roles
```

## Commands

### `/activityroles add`
Map an activity type and matching string to a role.

- `type`: `Playing` | `Streaming` | `Listening` | `Watching` | `Custom` | `Competing`
- `match`: Text to search for (case-insensitive substring match).
- `role`: Role to grant while the activity is active.

### `/activityroles remove`
Remove an existing activity role mapping.

- `type`: Activity type
- `match`: Text to match

### `/activityroles list`
Display all currently active activity mappings in the server.

## Configuration & Behavior

- Matching is case-insensitive.
- When an activity ends or the member changes presence, the role is automatically revoked.
- Multiple activities can map to the same role safely without duplicates.
