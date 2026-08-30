---
title: Lumi SDK Reference
description: Complete specification of all public imports available in the Lumi Addon SDK.
emoji: "📚"
category: "Guides"
tags: ["api", "sdk", "reference"]
---

Addon code must only import from the stable `lumi` public SDK packages. Direct imports from `#core/*`, `#lib/*`, or `#utilities/*` are forbidden and blocked by the addon validator.

## 1. `lumi` (Entry Point & Module System)

```typescript
import {
  Module,
  DefineModule,
  cfg,
  FieldType,
  ModuleListener,
  GuildMessageListener,
  Service,
  getService,
  tryGetService,
  NoEndUserData,
  noEndUserData,
} from "lumi";
```

- **`Module`**: Base class for all feature modules. Provides lifecycle hooks (`onLoad`, `onUnload`, `deleteUserData`, `exportUserData`, `reconcileScheduledJobs`).
- **`@DefineModule(options)`**: Decorator configuring module metadata (`name`, `displayName`, `emoji`, `version`, `description`, `configSchema`).
- **`cfg.*`**: Helper builder for config schemas (`cfg.string`, `cfg.number`, `cfg.boolean`, `cfg.enum`, `cfg.channel`, `cfg.role`, `cfg.user`, `cfg.object`).
- **`ModuleListener`**: Base class for gateway event listeners that automatically gates execution based on guild module enabled state.
- **`GuildMessageListener`**: Specialized listener for text messages sent within guilds.
- **`Service` / `getService`**: Service registry for singleton cross-piece coordination.

## 2. `lumi/commands` (Commands System)

```typescript
import {
  BaseCommand,
  BaseSubcommand,
  CommandContext,
  BucketScope,
  sendReply,
  replySuccess,
  replyError,
  replyWarning,
  replyInfo,
  assertPermit,
} from "lumi/commands";
```

- **`BaseCommand`**: Base class for top-level slash/prefix commands. Supports automatic permit checks via `requiredPermit`.
- **`BaseSubcommand`**: Base class for groupable subcommands.
- **`sendReply` / `reply*`**: Standardized, embed-free card reply helpers.

## 3. `lumi/permissions` (Permits & Access Control)

```typescript
import {
  hasRequiredPermit,
  checkModulesEnabled,
  isModuleEnabled,
} from "lumi/permissions";
```

- **`hasRequiredPermit(interaction, permitNode)`**: Evaluates Wick-style hierarchical permit nodes against the user, channel, and roles.
- **`isModuleEnabled(guildId, moduleName)`**: Checks if a module is currently enabled in the target guild.

## 4. `lumi/scheduling` (BullMQ Scheduled Tasks)

```typescript
import {
  RelayTask,
  scheduleTask,
  cancelTask,
  publishTaskFire,
  registerTaskFireHandler,
} from "lumi/scheduling";
```

- **`RelayTask`**: Scheduled task piece running on the primary shard and relaying effects via Redis Streams.
- **`scheduleTask(taskName, payload, options)`**: Enqueues delayed or recurring jobs backed by BullMQ.
- **`registerTaskFireHandler(taskName, routing, handler)`**: Registers task-fire handlers (`unicast` or `broadcast`).

## 5. `lumi/ui` (Cards & UI Kit)

```typescript
import {
  makeCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  makeErrorCard,
  ephemeralCard,
  noPingCard,
  resolveCardColor,
  defaultCardColors,
  confirmRow,
  backRow,
  confirmPrompt,
  paginateList,
  Emojis,
} from "lumi/ui";
```

- **`make*Card(...)`**: Constructs consistent brand-themed Discord message payloads without raw `EmbedBuilder`.
- **`paginateList(...)`**: Interactive paginated button/select lists.

## 6. `lumi/utils` (Utilities & Redis Locks)

```typescript
import {
  acquireRedisLock,
  verifyRedisLock,
  BotConfig,
  relativeTimestamp,
  shortTimestamp,
  parseDuration,
  formatDuration,
  errorFrom,
  swallow,
} from "lumi/utils";
```

- **`acquireRedisLock(redis, key, options)`**: Distributed Redis mutex with auto-extending lease preventing race conditions across worker shards.
