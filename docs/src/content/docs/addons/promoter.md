---
title: Promoter
description: Automatically reward members with roles when they promote your server in their status or name tag.
emoji: "📣"
category: "Addons"
tags: ["growth", "vanity", "rewards", "roles"]
---

**Promoter** incentivizes server growth by granting a special role to members who wear your server's vanity invite URL (e.g. `.gg/lumi`) or Discord native server tag.

## Installation

```sh
,download lumi-addons promoter
/modules enable promoter
```

## Configuration

- `promoter_role_id`: The role ID to grant to active promoters.
- `match_terms`: List of invite keywords to check in user statuses (e.g. `.gg/lumi`, `discord.gg/lumi`).
- `detect_server_tag`: Boolean switch to grant the role if the user displays the native server tag.
- `log_channel_id`: Channel for posting grant and revocation events.
- `sweep_interval_minutes`: Background reconciliation interval (default 30m) to self-heal missed gateway events.

## Commands

### `/promoter check member:@user`
Inspects a member's current status and server tag against the active promoter rules.

### `/promoter stats`
Displays total promoter role holders and historical growth.
