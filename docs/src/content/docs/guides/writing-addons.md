---
title: Writing Custom Addons
description: Step-by-step tutorial for creating, structuring, and testing your own Lumi addons.
emoji: "🛠️"
category: "Guides"
tags: ["development", "tutorial", "sdk"]
---

Addons in Lumi are fully self-contained directories. This guide walks through building a complete addon.

## Addon Structure

Every addon directory must contain at minimum:
- `info.json`: Metadata for the downloader.
- `index.ts`: The `@DefineModule` decorated class entry point.

Optional sub-store directories:
- `commands/`: Slash and prefix commands.
- `listeners/`: Discord event listeners.
- `interaction-handlers/`: Component interactions (buttons, selects, modals).
- `services/`: Singleton in-memory background services.
- `scheduled-tasks/`: Delayed or recurring BullMQ jobs.

## 1. Creating `info.json`

```json
{
  "name": "my-addon",
  "author": ["YourName"],
  "description": "A description of what your addon does.",
  "short": "Brief summary.",
  "version": "1.0.0",
  "min_bot_version": "1.0.0",
  "end_user_data_statement": "This addon does not store personal user data."
}
```

## 2. Defining the Module in `index.ts`

```typescript
import { Module, DefineModule, cfg } from "lumi";

@DefineModule({
  name: "my-addon",
  displayName: "My Addon",
  emoji: "⚡",
  version: "1.0.0",
  description: "An example custom addon.",
  configSchema: cfg.object({
    enabled_channel: cfg.channel({
      label: "Alert Channel",
      description: "Channel where automated alerts will be sent.",
    }),
    cooldown_seconds: cfg.number({
      label: "Cooldown (seconds)",
      description: "Cooldown between trigger events.",
      default: 30,
    }),
  }),
})
export class MyAddonModule extends Module {
  public override async deleteUserData(_userId: string): Promise<void> {
    // Clean up any per-user data when requested under GDPR
  }

  public override async exportUserData(_userId: string): Promise<Record<string, unknown> | null> {
    return null;
  }
}
```

## 3. Adding a Slash Command

Create `commands/ping.ts`:

```typescript
import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { BaseCommand } from "lumi/commands";
import { makeSuccessCard } from "lumi/ui";

@ApplyOptions<BaseCommand.Options>({
  name: "ping",
  description: "Check bot latency.",
  preconditions: ["GuildOnly"],
})
export class PingCommand extends BaseCommand {
  public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description)
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const wsPing = interaction.client.ws.ping;
    return interaction.reply(
      makeSuccessCard("Pong!", `Gateway latency: \`${wsPing}ms\``)
    );
  }
}
```

## 4. Validating Your Addon

Run the static validator from the Lumi repository to check for missing fields or unsafe imports:

```sh
bun run validate data/3rd-party-modules/my-addon
```
