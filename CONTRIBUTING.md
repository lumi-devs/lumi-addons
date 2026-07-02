# Contributing to Lumi Addons

Thank you for your interest in contributing to **Lumi Addons**! This repository houses first-party dynamic addons for the **Lumi** TypeScript Discord bot.

---

## 1. Code Quality & Verification Gates

The gates run against a local Lumi checkout — link one first:

```sh
git clone https://github.com/lumi-devs/lumi ../lumi   # and `bun install` inside it
bun run setup                                          # or LUMI_PATH=/path/to/lumi bun run setup
```

Then, before submitting a Pull Request:

1. **Type safety**:
   ```sh
   bun run typecheck
   ```
2. **ESLint**:
   ```sh
   bun run lint
   ```

All PRs must have **zero compile errors** and **zero lint errors** before they can be merged.

---

## 2. Addon Architectural Conventions

### A. Dynamic dependency isolation
If your addon needs external packages:
* List them under the `requirements` array in `info.json`.
* The downloader creates a private `package.json` inside the addon directory and runs `bun add` there.
* **Do not** assume anything about the bot's root `package.json`.

### B. UI through the card system
* **Never use `new EmbedBuilder()`.** All user-facing responses go through the card factories in `#utilities/cards.js` (`makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeInfoCard`, `makeListCard`) or the `replySuccess`/`replyError`/… helpers on `BaseCommand`.

### C. Isolated state management
* **Do not add methods to `DatabaseService`** — addons must be 100% self-contained.
* Persist through `container.db.guildKV` — the generic per-module key/value store, keyed `guildId + module + targetId + key`. Note the semantics: `listModuleData({ module, key, guildId })` filters on `key`, so the **varying identifier goes in `targetId`** and `key` names the collection (see `activity-roles/lib/store.ts` for the pattern).
* Use `container.redis` for high-speed ephemeral state; define your key builders in a local `keys.ts`.
* Do **not** touch `container.prisma` — addons get no schema of their own.

### D. GDPR
If your addon stores anything keyed by a user ID (DB or Redis), override `deleteUserData(userId, requester)` on your module class and delete it there. Write a `// No-op` override with a justification if you store nothing.

### E. Scheduled work
* BullMQ pieces live in a directory named exactly **`scheduled-tasks/`** (a `tasks/` directory is silently ignored).
* Discord/DB side-effects of a task must go through the fire bus: register with `registerTaskFireHandler(name, mode, handler)` in your module's `onLoad`. `"unicast"` = exactly one worker executes each fire (one-shot effects); `"broadcast"` = every worker executes and iterates its own `guilds.cache` (periodic sweepers).

---

## 3. Creating a New Addon

Every addon folder follows this anatomy (only `info.json` and `index.ts` are mandatory):

```
my-addon/
├── info.json              # Downloader metadata
├── index.ts               # Module entrypoint (@DefineModule)
├── README.md              # User-facing usage guide
├── commands/              # BaseCommand / BaseSubcommand pieces
├── listeners/             # Sapphire Listener pieces
├── interaction-handlers/  # buttons / selects / modals
├── scheduled-tasks/       # BullMQ ScheduledTask pieces (exact name!)
└── lib/ keys.ts …         # plain helpers, not pieces
```

The downloader registers the addon directory as a Sapphire base path, so the sub-store directories are discovered automatically — **do not call `stores.registerPath` yourself**.

### Example `info.json`

```json
{
  "name": "my-addon",
  "author": ["YourName"],
  "description": "What your addon does, one or two sentences.",
  "short": "One-line tagline.",
  "version": "1.0.0",
  "requirements": []
}
```

### Example `index.ts`

```typescript
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";

@DefineModule({
  name: "my-addon",
  displayName: "My Addon",
  emoji: "🚀",
  version: "1.0.0",
  description: "What your addon does.",
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Where events are posted.",
    }),
  }),
})
export class MyAddonModule extends Module {
  public override async deleteUserData(
    _userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // Delete anything keyed by userId here, or justify a no-op.
  }
}
```

Configuration declared in `configSchema` is automatically editable via `/config` and the dashboard; read it with `container.db.config.getModuleConfig(guildId, "my-addon", "log_channel_id")`.
