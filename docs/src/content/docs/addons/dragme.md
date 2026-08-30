---
title: DragMe
description: Consent-based voice channel drag requests with one-click interactive approval buttons.
emoji: "🧲"
category: "Addons"
tags: ["voice", "interactive", "consent"]
---

**DragMe** solves the friction of asking friends to drag you into closed or private voice channels. Members request to join a voice channel, and anyone currently inside can accept or decline with a single click.

## Installation

```sh
,download lumi-addons dragme
/modules enable dragme
```

## How It Works

1. Member runs `/dragme user:@Friend` or sends `@Friend` in the designated request channel.
2. An interactive card is posted to the voice channel's text chat with **Accept** and **Decline** buttons.
3. When a voice channel member clicks **Accept**, the requester is immediately moved into the channel, or granted a temporary connect pass if they aren't in voice yet.
4. If no one responds within the timeout, the request expires cleanly.
5. All state transitions are guarded by distributed Redis mutex locks to prevent race conditions.

## Commands

### `/dragme user:@member`
Request to be pulled into target user's current voice channel.
