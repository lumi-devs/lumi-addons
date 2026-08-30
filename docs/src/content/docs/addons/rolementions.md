---
title: Role Mentions
description: Track role mentions with daily analytics and auto-protect sensitive staff roles via native AutoMod rules.
emoji: "🛡️"
category: "Addons"
tags: ["automod", "anti-ping", "moderation", "analytics"]
---

**Role Mentions** provides real-time role ping tracking and automated spam defense. Protect staff roles from mention abuse using Discord's native AutoMod engine.

## Installation

```sh
,download lumi-addons rolementions
/modules enable rolementions
```

## Key Capabilities

- **Daily Mention Analytics**: Track daily and weekly ping counts across every role.
- **AutoMod Rule Sync**: Automatically registers Discord AutoMod mention rules to block unauthorized `@everyone`, `@here`, and `@Staff` pings at the Discord edge.
- **Exemptions & Cooldowns**: Configurable ping cooldowns and exempt channel/role lists.

## Commands

### `/rolementions stats [role:@role]`
View mention frequency and recent ping events.

### `/rolementions protect role:@role limit:3`
Configures AutoMod rate-limit protection for a sensitive role.
