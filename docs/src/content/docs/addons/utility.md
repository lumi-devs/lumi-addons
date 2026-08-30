---
title: Utility Tools
description: Multi-engine language translation and custom emoji stealer with automated image processing.
emoji: "🧰"
category: "Addons"
tags: ["utility", "translate", "emoji-stealer", "tools"]
---

**Utility Tools** provides essential everyday Discord server utilities: multi-engine language translation and custom emoji extraction.

## Installation

```sh
,download lumi-addons utility
/modules enable utility
```

## Commands

### `/translate text:"Bonjour le monde" target_language:"English"`
Translates text into the target language with automatic source language detection.

### `/steal emoji_or_url:<emoji|image_url> [name:custom_name]`
Extracts custom emojis from messages, direct URLs, or replied messages, optimizes the image, and uploads it as a custom emoji to the server (under the 256 KB Discord limit). Also supports prefix command `,steal`.
