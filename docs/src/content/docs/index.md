---
title: Lumi Addon Ecosystem
description: Dynamic, hot-loadable modules for the modular Lumi Discord bot.
emoji: "⚡"
category: "Overview"
tags: ["addons", "modular", "sdk"]
---

Welcome to the **Lumi Addons** documentation. Addons in Lumi are independent, dynamically loadable feature modules that run directly inside the bot worker processes with zero runtime overhead.

## Core Principles

- **Hot Loading & Unloading**: Install or upgrade addons at runtime with `,download` or `/modules enable` without restarting the gateway connection.
- **Strict SDK Boundary**: Addon code is protected against core internal refactors by importing only from the stable `lumi/*` public SDK.
- **Zero Cross-Module Pollution**: Each addon operates in its own isolated namespace. No hidden dependencies between addons.
- **GDPR by Design**: Every addon explicitly states what user data it processes and implements automatic data export and deletion hooks.
- **Multi-Instance Safe**: Addons leverage Redis mutex locks (`acquireRedisLock`) and Redis Streams scheduled task broadcasts to scale seamlessly across multi-shard clusters.

## Addon Architecture

```
my-addon/
├── info.json              # Downloader metadata & end_user_data_statement
├── manifest.json          # Pre-computed static contract for fast discovery
├── index.ts               # @DefineModule decorator & lifecycle hooks
├── commands/              # Slash and prefix commands (BaseCommand / BaseSubcommand)
├── listeners/             # Discord gateway events (ModuleListener / GuildMessageListener)
├── interaction-handlers/  # Buttons, select menus, and modals
├── services/              # Singleton background services (Service)
└── scheduled-tasks/       # BullMQ delayed / cron jobs (RelayTask)
```

## Quick Navigation

- [**Getting Started**](/docs/guides/getting-started): Install and enable addons on your Lumi bot.
- [**Writing Addons**](/docs/guides/writing-addons): Build your first custom addon from scratch.
- [**SDK Reference**](/docs/guides/sdk-reference): Full reference of all public exports in the `lumi` SDK.
- [**First-Party Addons**](/docs/addons/activity-roles): Explore all 10 verified first-party addons.
