# 🔥 Ember Addons

Unified 1st-party modules and extensive addons for the **Ember** TypeScript Discord bot.

## Available Modules

| Module | Description | Commands |
|--------|-------------|----------|
| **[emoji-stealer](./emoji-stealer/)** | Steal emojis from messages, replies, or direct URLs and upload them instantly. | `,steal` |
| **[tags](./tags/)** | Create, manage, and display custom tag responses and server triggers using fast Redis storage. | `,tag` |

---

## Installation Guide

### 1. Add Repository
To register this private repository with your Ember instance, use the `repo` command:
```bash
,repo add ember-addons git@github.com:ember-hq/ember-addons.git master
```

### 2. Download Modules
Install the modules dynamically into your runtime:
```bash
,download ember-addons emoji-stealer
,download ember-addons tags
```

The Downloader will automatically pull the code, install any requirements, symlink them to `src/modules/`, and hot-load them into the bot — no restart required!
