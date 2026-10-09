# 🛡️ Role Mentions Addon

<p align="center">
  <img src="https://img.shields.io/badge/Lumi-Addon-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Lumi Addon" />
  <img src="https://img.shields.io/badge/Module-rolementions-red?style=for-the-badge" alt="Module Name" />
  <img src="https://img.shields.io/badge/Version-1.0.0-emerald?style=for-the-badge" alt="Version" />
</p>

> **Role mention tracking and auto-protection via timed mention blocks.**

---

## 🌟 Overview

The **Role Mentions** addon monitors role pings across your server, tracks daily mention analytics in KV, and automatically protects sensitive roles from mention spam via timed mention blocks managed with `lumi/scheduling`.

---

## ✨ Features

- **Daily Mention Analytics**: Records per-role mention counters in KV; automatically resets daily at 00:00 UTC.
- **Timed Auto-Protection**: Automatically blocks mentions of protected roles when pinged, with automatic expiration via scheduled tasks.
- **Manual Role Blocks**: On-demand temporary or timed mention blocking for specific roles (`rp block`).
- **Safe Audit Logs**: Posts mention activity to the log channel with mentions suppressed.

---

## 📥 Installation & Activation

```bash
,download lumi-addons rolementions
```

Configure log channels and options via `/config` under **Role Mentions**.

---

## ⚙️ Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :---: | :--- |
| `log_channel_id` | `Channel` | *None* | Text channel where mention stats and protection logs are posted. |
| `auto_protect` | `Boolean` | `true` | Automatically block protected roles when pinged in chat. |

---

## 💻 Commands & Usage

### Mention Statistics Commands (`/rolementions`)
| Command | Arguments | Description |
| :--- | :--- | :--- |
| `/rolementions stats` | `[role: Role]` | View today's mention count for all roles or a specific role. |
| `/rolementions top` | `[limit: 1-25]` | Display the most-mentioned roles in the server today. |
| `/rolementions reset` | *None* | *(Admin)* Reset today's mention counters manually. |

### Protection Management Commands (`/roleprotect`)
| Command | Arguments | Description |
| :--- | :--- | :--- |
| `/roleprotect add` | `role: Role`, `[duration: string]` | Protect a role from mention spam (e.g. `90m`, `2h`, `1d`). |
| `/roleprotect remove` | `role: Role` | Remove a role from the auto-protection list. |
| `/roleprotect list` | *None* | Display all protected roles and active blocks. |
| `/roleprotect block` | `role: Role`, `[duration: string]` | Immediately block mentions of a role. |
| `/roleprotect unblock` | `role: Role` | Lift an active mention block ahead of schedule. |

---

## 📡 Events & Scheduled Tasks

- **`messageCreate` Listener**: Scans incoming messages for role mentions, increments daily counters in KV, and activates timed blocks if a protected role is pinged.
- **Scheduled Task (`rolementions:expire`)**: Fires when a timed block expires to lift protection and notify the log channel.
- **GDPR Standard**: Counters and blocks are keyed by role ID. No per-user data is stored.
