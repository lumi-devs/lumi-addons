<div align="center">

# ✨ Lumi Addons
  
**A curated collection of first-party dynamic modules for the [Lumi Discord Bot](https://github.com/lumi-devs/lumi).**

[![Bun](https://img.shields.io/badge/Runtime-Bun-black?style=for-the-badge&logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-GPL_3.0-green?style=for-the-badge) ](./LICENSE)

*Enhance your server with auto-scaling voice lounges, role protections, anonymous confessions, and much more—all hot-loadable with zero downtime.*

<br>
</div>

## 📦 Available Addons

Here is the current catalog of official addons. Each addon is isolated and runs within its own sandbox.

<table width="100%">
  <tr>
    <td width="50%" valign="top">
      <h4>🎮 <a href="./activity-roles/">Activity Roles</a></h4>
      <p>Auto-assign roles based on users' Discord presence (Playing, Streaming, Listening, etc).</p>
      <sup><em>Requires PRESENCE_INTENT=true</em></sup>
    </td>
    <td width="50%" valign="top">
      <h4>💎 <a href="./booster-roles/">Booster Roles</a></h4>
      <p>Manage custom booster roles with configurable grace periods for expired server boosts.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>🕊️ <a href="./confessions/">Confessions</a></h4>
      <p>Anonymous confessions via <code>/confess</code> with threads, anonymous replies, cooldowns, and mod bans.</p>
    </td>
    <td width="50%" valign="top">
      <h4>📞 <a href="./dragme/">Drag Me</a></h4>
      <p>Voice drag requests approved by the people already in the channel.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>🛋️ <a href="./multi-lounge/">Multi Lounge</a></h4>
      <p>Auto-scaling voice lounges—clones a base channel when busy and removes extras when empty.</p>
    </td>
    <td width="50%" valign="top">
      <h4>📣 <a href="./promoter/">Promoter</a></h4>
      <p>Auto-role for members advertising the server in their custom status or native server tag.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>🛡️ <a href="./rolementions/">Role Mentions</a></h4>
      <p>Tracks role mentions with daily stats and auto-protects sensitive roles via AutoMod rules.</p>
    </td>
    <td width="50%" valign="top">
      <h4>🔁 <a href="./status/">Status</a></h4>
      <p>Rotating bot presence managed by the bot owner via <code>/status</code>.</p>
      <sup><em>Global module</em></sup>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>🧹 <a href="./thread-cleaner/">Thread Cleaner</a></h4>
      <p>Automatically archives/locks threads after inactivity, plus an admin bulk sweep.</p>
    </td>
    <td width="50%" valign="top">
      <h4>⚙️ <a href="./utility/">Utility</a></h4>
      <p>General utility commands including translations and emoji stealing.</p>
      <sup><em>Replaces auto-translate & emoji-stealer</em></sup>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>✅ <a href="./verify/">Verify</a></h4>
      <p>Math captcha verification for new members: pending role on join, verified role on success, kick on timeout.</p>
    </td>
    <td width="50%" valign="top">
      <!-- Empty cell for grid balance -->
    </td>
  </tr>
</table>

<br>

## 🚀 Installation & Loading

Lumi ships with a built-in dynamic module downloader. Installing addons takes seconds and requires **no bot restart**.

<details>
<summary><b>🛠️ Click here for step-by-step installation instructions</b></summary>
<br>

**1. Add this repository to your bot**
```bash
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git
```
*(No branch argument needed—the default branch is used automatically).*

**2. Download and hot-load the addon**
```bash
,download lumi-addons utility
```

The downloader will automatically pull the code, install any `package.json` requirements into an **isolated sandbox** (`node_modules` inside the addon folder), symlink it into `data/installed-modules/`, and hot-load the module. You can configure the addon immediately via the `/config` slash command or the web dashboard.
</details>

<br>

## 💻 Development

Typecheck and lint run against a local Lumi checkout. See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for architecture conventions.

```bash
# Clone the main repo as a sibling
git clone https://github.com/lumi-devs/lumi ../lumi   

# Run setup and validations
bun run setup        # or: LUMI_PATH=/path/to/lumi bun run setup
bun run typecheck
bun run lint
```

<br>

<div align="center">
  <p>Released under the <a href="./LICENSE">GNU General Public License v3.0</a>.</p>
</div>
