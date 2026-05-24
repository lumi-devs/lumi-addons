<h1 align="center">🔥 Ember Addons</h1>

<p align="center">Unified 1st-party modules, dynamic plugins, and extensive addons for the <a href="https://github.com/ember-hq/bot">Ember</a> TypeScript / Sapphire Discord bot.</p>

<p align="center">
  <img src="https://img.shields.io/badge/requires-Ember%202.0%2B-orange.svg" alt="Requires Ember">
  <img src="https://img.shields.io/badge/runtime-Bun-blue.svg" alt="Requires Bun">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License GPL-3.0"></a>
</p>

---

## 📦 Available Modules

| Module | Description | Commands |
|--------|-------------|----------|
| **[emoji-stealer](./emoji-stealer/)** | Steal custom emojis from messages, replies, or direct URLs and upload them instantly. | `,steal` |

---

## 🚀 Installation & Loading

Ember features a powerful built-in dynamic module downloader. Installing addons takes seconds and requires **no bot restart**!

### 1. Add Repository
Register this public addons repository with your running Ember instance:
```bash
,repo add ember-addons https://github.com/ember-hq/ember-addons.git
```
*(No branch parameter is needed! It automatically resolves your repository's primary branch.)*

### 2. Download and Hot-Load
Install the module dynamically in real-time:
```bash
,download ember-addons emoji-stealer
```

The Downloader will automatically pull the code, dynamically install any dynamic NPM dependencies in an **isolated module sandbox** (`node_modules` inside the module folder), symlink it, and hot-load it into memory.

---

## 🤝 Contributing

We welcome contributions from the community! If you would like to submit a new module or fix an issue, please read our **[Contributing Guidelines](./CONTRIBUTING.md)** first to ensure your code matches Ember's architecture and quality gates.

---

## 📄 License

This repository is licensed under the **GNU General Public License v3.0**. See the [LICENSE](./LICENSE) file for the full license text.
