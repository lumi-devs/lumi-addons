# ⚙️ Utility

General utility tools: custom emoji stealing and text translation.

## Commands

| Command | Option | Description |
| :--- | :--- | :--- |
| `/steal` | `emoji_or_url` | Custom emoji, image URL, or message link/ID to steal from. |
| `/steal` | `name` | *(Optional)* Custom name for the new emoji. Required when stealing from a URL. |
| `/translate` | `text` | Text to translate (source language auto-detected). |
| `/translate` | `target` | *(Optional)* Target language code or name, e.g. `es`, `Japanese`. Defaults to English. |

Prefix usage: `steal <:emoji:> [name]`, `translate [target] <text>`
(e.g. `translate es Hello world`).

## Permissions

- `/steal` requires the invoker to have **Manage Emojis and Stickers** (or Administrator), and the bot to have it too.
- `/translate` is available to all members.

## Notes

- `/steal` grabs custom emojis from a message and the message it replies to (up to 5 per command). Images must be under 256 KB.
- No user data is stored (`deleteUserData` is a no-op).
