<div align="center">
  <br/>
  <h1>✨ Lumi Addons ✨</h1>
  <p><b>A curated collection of highly dynamic, drop-in modules for the <a href="https://github.com/lumi-devs/lumi">Lumi Discord Bot</a>.</b></p>

  [![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![License](https://img.shields.io/badge/License-GPL_3.0-4CAF50?style=for-the-badge)](./LICENSE)
  
  <p><i>Enhance your server with auto-scaling lounges, role protections, anonymous confessions, and much more—all hot-loadable with <b>zero downtime</b>.</i></p>
  <br/>
</div>

---

## 📦 Available Addons

| Addon | Description | Extra |
| :--- | :--- | :--- |
| 🎮 **[Activity Roles](./activity-roles/)** | Auto-assign roles based on users' Discord presence. | ⚠️ *Requires PRESENCE_INTENT* |
| 💎 **[Booster Roles](./booster-roles/)** | Manage custom booster roles with grace periods. | |
| 🕊️ **[Confessions](./confessions/)** | Anonymous confessions system via `/confess`. | 🔒 *Threads, Mod Bans, Cooldowns* |
| 📞 **[Drag Me](./dragme/)** | Voice drag requests approved by channel members. | |
| 🛋️ **[Multi Lounge](./multi-lounge/)** | Auto-scaling voice lounges (clones base channel). | |
| 📣 **[Promoter](./promoter/)** | Auto-role for members advertising the server. | 🏷️ *Checks custom status & tags* |
| 🛡️ **[Role Mentions](./rolementions/)** | Track mentions & auto-protect sensitive roles. | 📊 *Daily stats included* |
| 🔁 **[Status](./status/)** | Rotating bot presence managed via `/status`. | 🌍 *Global Module* |
| 🧹 **[Thread Cleaner](./thread-cleaner/)** | Archive/lock threads automatically after inactivity. | 🧹 *Admin sweep available* |
| ⚙️ **[Utility](./utility/)** | General commands (translations, emoji stealing). | |
| ✅ **[Verify](./verify/)** | Math captcha verification for new members. | ⏳ *Kicks on timeout* |

---

## 🚀 Quick Start

Lumi ships with a built-in dynamic module downloader. Installing addons takes seconds and requires **no bot restart**.

```bash
# 1. Add this repository to your bot
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git

# 2. Download and hot-load an addon
,download lumi-addons <addon-name>
```

> **Note:** The downloader automatically pulls the code, installs dependencies into an isolated sandbox, and hot-loads it. Configure it immediately via `/config` or the web dashboard.

---

## 💻 Development

Typecheck and lint run against a local Lumi checkout.

```bash
# Clone the main repo as a sibling
git clone https://github.com/lumi-devs/lumi ../lumi   

# Run setup and validations
bun run setup 
bun run typecheck
bun run lint
```

<div align="center">
  <br/>
  <p>Released under the <a href="./LICENSE">GNU General Public License v3.0</a>.</p>
</div>
