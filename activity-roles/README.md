# 🎮 Activity Roles Addon

<p align="center">
  <img src="https://img.shields.io/badge/Lumi-Addon-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Lumi Addon" />
  <img src="https://img.shields.io/badge/Module-activity--roles-blue?style=for-the-badge" alt="Module Name" />
  <img src="https://img.shields.io/badge/Version-1.0.0-emerald?style=for-the-badge" alt="Version" />
</p>

> **Presence-based dynamic role automation for the Lumi Discord platform.**

---

## 🌟 Overview

The **Activity Roles** addon automatically assigns roles to server members based on their active Discord presence or custom status. Whether members are playing a specific game, streaming on Twitch, listening to Spotify, or wearing custom status text, Activity Roles handles automatic assignment and revocation when the activity stops.

---

## ✨ Features

- **Full Presence Support**: Detects `Playing`, `Streaming`, `Listening`, `Watching`, `Custom`, and `Competing` activity types.
- **Substring & Text Matching**: Flexible string matching rules per activity rule.
- **Additive-only Revocation**: Only roles this addon granted are ever removed; manually assigned roles are never stripped.
- **Single Source of Truth**: One kv record per member (`activities` snapshot + `granted` role IDs); every event converges it.

---

## 📥 Installation & Activation

Install the module using Lumi's built-in dynamic downloader:

```bash
# Download and hot-load the module
,download lumi-addons activity-roles
```

> [!NOTE]
> Requiring the privileged **Presence Intent** in Discord Developer Portal is mandatory for presence update tracking.

---

## ⚙️ Configuration Options

Activity Roles mappings are stored dynamically per guild via `/activityroles` commands:

| Mapping Attribute | Type | Description |
| :--- | :--- | :--- |
| `type` | `Enum` | Activity type (`Playing`, `Streaming`, `Listening`, `Watching`, `Custom`, `Competing`). |
| `match` | `String` | Text or substring to match against activity name or custom status message. |
| `role` | `Role` | Discord role to assign when the rule condition is satisfied. |

---

## 💻 Commands & Usage

All commands require **Manage Roles** permission:

| Command | Subcommand | Arguments | Description |
| :--- | :--- | :--- | :--- |
| `/activityroles` | `add` | `type: ActivityType`, `match: string`, `role: Role` | Create a new presence-to-role rule mapping. |
| `/activityroles` | `remove` | `type: ActivityType`, `match: string` | Remove an existing activity role mapping. |
| `/activityroles` | `list` | *None* | Display all configured activity role rules for this server. |

---

## 📡 Events & Listeners

- **`presenceUpdate`** (`lib/converge.ts`): Recomputes desired roles from the event's activities, diffs against the member's kv record, adds/removes, persists.
- **`guildMemberUpdate`** (`lib/converge.ts`): Reconciles external role changes against the stored snapshot (prunes roles removed by moderators). Carries no activity data, so members with no record are skipped.
- Other sandbox events (`voiceStateUpdate`, `messageCreate`, `threadCreate`, `userUpdate`) carry no activity or role data this addon can act on, so it does not subscribe to them.

- **GDPR Standard**:
  Per-member records are keyed by user ID in guild kv storage and are removed automatically on user-data purge requests.

---

## 🎨 Code Examples

### Event Flow Architecture

```mermaid
sequenceDiagram
    autonumber
    actor User as Member Presence
    participant Handler as convergeMember
    participant Matcher as Activity Matcher
    participant KV as lumi/kv member record
    participant Guild as Discord Guild Member

    User->>Handler: presenceUpdate / guildMemberUpdate
    Handler->>KV: Load member record
    KV-->>Handler: Snapshot + granted roles
    Handler->>Matcher: Evaluate activities vs rules, diff owned roles
    Matcher-->>Handler: Add / Remove / next granted set
    Handler->>Guild: Add or remove owned activity roles
    Handler->>KV: Persist converged record (or clear when empty)
```

### TypeScript Mapping Example

```ts
import { matchActivity } from "./lib/matcher.js";

// Example activity matching check
const isMatch = matchActivity({
  ruleType: "Playing",
  ruleMatch: "VALORANT",
  userActivities: [
    { type: 0, name: "VALORANT", state: "In Game" }
  ]
});

console.log(`Activity match status: ${isMatch}`); // true
```
