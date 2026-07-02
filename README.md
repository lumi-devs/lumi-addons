<h1 align="center">✨ Lumi Addons</h1>

<p align="center">First-party dynamic addons for the <a href="https://github.com/lumi-devs/lumi">Lumi</a> TypeScript / Sapphire Discord bot.</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Bun-blue.svg" alt="Requires Bun">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License GPL-3.0"></a>
</p>

---

## 📦 Available Addons

| Addon | Description | Notes |
|-------|-------------|-------|
| **[activity-roles](./activity-roles/)** | Auto-assign roles from Discord presence (Playing, Streaming, Listening, …). | Requires `PRESENCE_INTENT=true` on the bot **and** the Presence Intent toggle in the Developer Portal. |
| **[auto-translate](./auto-translate/)** | Translate messages to English via `/translate`, right-click → Apps → Translate, or `,translate`. | |
| **[emoji-stealer](./emoji-stealer/)** | Steal custom emojis from messages, replies, or URLs and upload them to your server. | `,steal` |
| **[rolementions](./rolementions/)** | Role-mention tracking with daily stats + AutoMod-backed protection of sensitive roles. | |
| **[thread-cleaner](./thread-cleaner/)** | Auto-archive or lock threads after configurable inactivity. | |
| **[verify](./verify/)** | Emoji-sequence captcha gate for new members: pending role on join, verified role on success, kick on timeout. | |

---

## 🚀 Installation & Loading

Lumi ships a built-in dynamic module downloader. Installing addons takes seconds and requires **no bot restart**.

### 1. Add this repository

```
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git
```

*(No branch argument needed — the repo's default branch is used.)*

### 2. Download and hot-load an addon

```
,download lumi-addons emoji-stealer
```

The downloader pulls the code, installs any NPM `requirements` into an **isolated per-addon sandbox** (`node_modules` inside the addon folder), symlinks it into `data/installed-modules/`, and hot-loads it. Configure the addon afterwards with `/config`.

---

## 🛠 Developing addons

Typecheck and lint run against a local Lumi checkout:

```sh
git clone https://github.com/lumi-devs/lumi ../lumi   # sibling checkout (bun install inside)
bun run setup        # or: LUMI_PATH=/path/to/lumi bun run setup
bun run typecheck
bun run lint
```

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for architecture conventions and the addon anatomy.

---

## 📄 License

GNU General Public License v3.0 — see [LICENSE](./LICENSE).
