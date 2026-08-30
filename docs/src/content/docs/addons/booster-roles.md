---
title: Booster Roles
description: Self-service custom roles for server boosters with color picker, role sharing, and grace periods.
emoji: "✨"
category: "Addons"
tags: ["nitro", "boosters", "custom-color", "perks"]
---

**Booster Roles** gives server boosters the ability to create, recolor, and share their own custom role with friends, managed through an interactive Discord UI panel.

## Installation

```sh
,download lumi-addons booster-roles
/modules enable booster-roles
```

## Key Features

- **Interactive Panel**: Boosters manage their role using buttons and modals (`/boosterroles`).
- **Color Customization**: Support for hex colors and Discord preset colors with live preview.
- **Role Sharing**: Boosters can share their custom role with up to a configurable number of friends.
- **Boost Grace Period**: When a member stops boosting, their role enters a configurable grace period (default 3 days) before deletion, scheduled via BullMQ.
- **Moderator Controls**: Admin subcommands for deleting offensive roles, viewing stats, and blacklisting members from using the perk.

## Commands

### `/boosterroles`
Opens the booster's personal role management panel.

### `/boosterroles action:stats`
Displays server-wide booster role metrics and adoption rates.

### `/boosterroles action:delete user:@member`
Moderator action to remove a member's custom role.

### `/boosterroles action:blacklist user:@member`
Blocks a member from creating custom booster roles.
