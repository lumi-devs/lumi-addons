# 🤝 Contributing to Lumi Addons

<p align="center">
  <img src="https://img.shields.io/badge/Lumi-Addons--Contribution--Guide-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Lumi Addons Contribution Guide" />
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Bun-1.3+-000000?style=for-the-badge&logo=bun&logoColor=white" alt="Bun" />
</p>

Thank you for your interest in contributing to **Lumi Addons**! This repository houses official first-party dynamic addons for the **Lumi** TypeScript Discord platform.

> [!NOTE]
> All addons in this repository are designed to be hot-loadable, sandboxed, and zero-downtime extensions. Please adhere to the architectural laws and guidelines outlined below.

---

## 📋 Table of Contents

- [1. Development Environment & Setup](#1-development-environment--setup)
- [2. Architectural Laws & Conventions](#2-architectural-laws--conventions)
  - [A. Dynamic Dependency Isolation](#a-dynamic-dependency-isolation)
  - [B. Card UI System Enforcement](#b-card-ui-system-enforcement)
  - [C. Isolated State Management](#c-isolated-state-management)
  - [D. GDPR Data Erasure Standard](#d-gdpr-data-erasure-standard)
  - [E. Scheduled Tasks & Fire Bus](#e-scheduled-tasks--fire-bus)
- [3. Anatomy of an Addon Module](#3-anatomy-of-an-addon-module)
- [4. Verification Gates](#4-verification-gates)
- [5. Submitting Pull Requests](#5-submitting-pull-requests)

---

## 1. Development Environment & Setup

To develop or test addons locally, link your checkout against a local instance of **Lumi Core**:

```bash
# 1. Clone Lumi Core alongside the addons repository
git clone https://github.com/rebizzz/lumi ../lumi

# 2. Run setup script to link node_modules & type definitions
bun run setup
```

> [!TIP]
> If your Lumi checkout lives in a non-standard location, set the environment variable:
> ```bash
> LUMI_PATH=/path/to/lumi bun run setup
> ```

---

## 2. Architectural Laws & Conventions

### A. Dynamic Dependency Isolation
If your addon requires external NPM packages:
* List them under the `requirements` array in `info.json`.
* Lumi's dynamic downloader manages private package dependencies per addon directory.
* **Do not** modify the root `package.json` of Lumi Core or add dependencies globally.

### B. Card UI System Enforcement
* **Never create raw `EmbedBuilder` instances.**
* All user-facing interaction responses must utilize card helpers from `#utilities/cards.js` (`makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeInfoCard`, `makeListCard`) or the `replySuccess`/`replyError` helpers on `BaseCommand`.

### C. Isolated State Management
* **Zero Cross-Module Imports**: Addons must remain 100% self-contained and decoupled.
* **Database Access**: Persist through `container.db.guildKV` (keyed by `guildId + module + targetId + key`).
* **Ephemeral Cache**: Use `container.redis` for high-speed ephemeral state; define key builders in a local `keys.ts`.
* **Prisma Schema**: Do **not** touch `container.prisma` — addons get no custom database schemas.

### D. GDPR Data Erasure Standard
If your addon stores any user-identifiable data (in Database or Redis), override `deleteUserData(userId, requester)` in your module entrypoint class (`index.ts`) to clean up user data upon request.

```ts
export class MyAddonModule extends Module {
  public override async deleteUserData(
    userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // Delete user-keyed data across all guilds
  }
}
```

If no user data is stored, provide a documented no-op override:

```ts
public override async deleteUserData(_userId: string): Promise<void> {
  // No-op: This module only stores aggregate guild configurations.
}
```

### E. Scheduled Tasks & Fire Bus
* Place BullMQ task pieces inside a directory named **`scheduled-tasks/`** (do not name it `tasks/`).
* Discord API / Database side-effects must be dispatched through the fire bus using `registerTaskFireHandler(name, mode, handler)` in `onLoad()`:
  * `"unicast"`: Exactly one worker executes the handler (suited for one-shot timers).
  * `"broadcast"`: Every worker node executes and sweeps its local `guilds.cache` (suited for periodic sweeps).

---

## 3. Anatomy of an Addon Module

Every addon directory strictly follows this structure:

```
my-addon/
├── info.json              # Module metadata & downloader configuration
├── index.ts               # Module entrypoint annotated with @DefineModule
├── README.md              # User-facing addon documentation
├── commands/              # BaseCommand & BaseSubcommand pieces
├── listeners/             # Sapphire event listeners
├── interaction-handlers/  # Button, Select Menu, and Modal handlers
├── scheduled-tasks/       # BullMQ ScheduledTask pieces (exact directory name!)
└── lib/                   # Internal helpers, key builders (keys.ts), and stores
```

### Example `info.json`

```json
{
  "name": "my-addon",
  "author": ["YourName"],
  "description": "Short explanation of your addon capabilities.",
  "short": "One-line tagline.",
  "version": "1.0.0",
  "requirements": []
}
```

### Example `index.ts`

```ts
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";

@DefineModule({
  name: "my-addon",
  displayName: "My Addon",
  emoji: "🚀",
  version: "1.0.0",
  description: "Detailed description of the addon module.",
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel where activity events are posted.",
    }),
  }),
})
export class MyAddonModule extends Module {
  public override async deleteUserData(
    _userId: string,
    _requester: import("#core/lib/gdpr.js").RequesterType,
  ): Promise<void> {
    // Delete user-keyed data here
  }
}
```

---

## 4. Verification Gates

Before submitting code, run the verification suite:

| Check | Command | Criterion |
| :--- | :--- | :--- |
| **Type Integrity** | `bun run typecheck` | 0 type errors |
| **Code Style & Linting** | `bun run lint` | 0 lint warnings/errors |

---

## 5. Submitting Pull Requests

1. **Create a Feature Branch**: Branch off `master` using a descriptive name (`feature/my-new-addon`).
2. **Follow Content Standards**: Write a complete `README.md` for any new module with all required sections (Overview, Features, Installation & Activation, Configuration Options, Commands & Usage, Events/Listeners, Code Examples).
3. **Verify Gates**: Run `bun run typecheck` and `bun run lint`.
4. **Open a PR**: Fill in the PR template detailing changes, architecture considerations, and verification steps.
