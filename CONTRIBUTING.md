# Contributing to Ember Addons

Thank you for your interest in contributing to **Ember Addons**! This repository houses high-quality, 1st-party dynamic modules and extensive addons for the **Ember** TypeScript Discord bot.

By contributing to this repository, you help expand the ecosystem for all Ember bot hosts.

---

## 1. Code Quality & Verification Gates

Before submitting a Pull Request, please ensure your module adheres to our strict quality checks. Your code **must** compile and pass formatting verification completely:

1. **Type Safety check**:
   ```bash
   bun run typecheck
   ```
2. **ESLint formatting check**:
   ```bash
   bun run lint
   ```

All PRs must have **zero compile errors** and **zero lint warnings/errors** before they can be merged.

---

## 2. Module Architectural Conventions

All submitted addons must follow Ember's core non-negotiable coding conventions:

### A. Dynamic Dependency Isolation
Ember features dynamic plugin isolation. If your module has external package dependencies:
* List them under the `requirements` array inside your `info.json` file.
* The downloader will automatically initialize a private, localized `package.json` inside your module's directory and run `bun add` locally.
* **Do not** add dependencies to the bot's root `package.json` file.

### B. Clean UI Design Systems
* **Never use `new EmbedBuilder()`** directly. All UI/UX responses must be formatted using Ember's beautiful native card factories located under `#utilities/cards.js` (`makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeInfoCard`, etc.).

### C. Isolated State Management
* **Do not add module-specific methods to the main `DatabaseService`**. Modules must remain 100% self-contained. 
* Access data directly via `container.prisma` (relational Postgres data) or `container.redis` (high-speed key-value cache/state).
* Avoid creating custom database migrations unless strictly necessary; prefer utilizing fast Redis storage for modular features to keep installation immediate.

---

## 3. Creating a New Module

Every module folder must follow this exact anatomy:
```
my-module/
├── info.json       # Downloader metadata (author, name, requirements, etc.)
├── index.ts        # Dynamic module entrypoint extending Module base class
├── commands/       # Directory containing command/subcommand files
└── README.md       # User-facing installation and usage guide
```

### Example `info.json`:
```json
{
  "name": "my-module",
  "author": ["YourName"],
  "description": "Short explanation of what your dynamic module does.",
  "short": "Summarized tagline.",
  "version": "1.0.0",
  "requirements": ["axios"]
}
```

### Example `index.ts`:
```typescript
import { Module, EmberModule } from "#core/module-system/Module.js";

@EmberModule({
  name: "my-module",
  displayName: "My Module",
  emoji: "🚀",
  version: "1.0.0",
  description: "Short explanation of what your dynamic module does.",
})
export class MyModule extends Module {
  public registerServices() {}

  public override onLoad() {
    this.container.stores.registerPath(new URL("./commands/", import.meta.url));
    return super.onLoad();
  }

  public override async deleteUserData(
    _userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // Implement GDPR user data deletion here if your module stores user data
  }
}
```
