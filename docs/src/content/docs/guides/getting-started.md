---
title: Getting Started with Addons
description: Learn how to add repositories, install addons, and configure them on your server.
emoji: "🚀"
category: "Guides"
tags: ["install", "setup", "quickstart"]
---

Lumi features a built-in module downloader inspired by Red-DiscordBot's Downloader, designed for modern TypeScript and hot-reloading.

## 1. Adding an Addon Repository

To install addons, first add the repository URL to your Lumi bot:

```sh
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git
```

This clones the repository into `data/3rd-party-modules/lumi-addons/` and scans the available modules.

## 2. Listing Available Addons

View all addons available in the repository:

```sh
,repo list lumi-addons
```

## 3. Installing an Addon

Download and install any addon from the repository:

```sh
,download lumi-addons booster-roles
```

When you install an addon:
1. Lumi validates the addon structure, imports, and metadata.
2. Creates an isolated symlink in `data/installed-modules/booster-roles`.
3. Auto-generates `manifest.json` if not present.
4. Registers the new commands, listeners, and scheduled tasks immediately with zero downtime.

## 4. Enabling the Module in Your Server

Once installed, server administrators can enable the module for their guild:

```sh
/modules enable booster-roles
```

## 5. Configuring Addon Settings

You can configure the addon using slash commands, the interactive admin panel, or via the Web Dashboard:

```sh
/config module booster-roles
```
