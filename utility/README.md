# Utility

Small everyday tools: steal custom emojis into your server and translate text.

## Commands

| Command | Options | Description |
| --- | --- | --- |
| `/steal` | `emoji_or_url` (required), `name` (optional) | Add custom emojis from an emoji mention, an image URL, or a Discord message link/ID. |
| `/translate` | `text` (required), `target` (optional) | Translate text, auto-detecting the source language. Defaults to English. |

All replies are ephemeral and only visible to the person who ran the command.

## `/steal`

`emoji_or_url` accepts:

- A custom emoji mention such as `<:wave:123456789012345678>` or `<a:party:123456789012345678>`.
- An image URL. The image must be a PNG, JPEG, or GIF and at most 256 KB.
  Redirects are followed manually, up to 3 hops, and every hop must pass the
  same public-host SSRF checks.
- A Discord message link or message ID. The message content and the message it replies to are scanned for up to 5 custom emojis.

When `name` is omitted, the name is inferred from the emoji or the URL filename. Names must match `[A-Za-z0-9_]{2,32}`. A custom name can only be used when stealing a single emoji.

The invoker and the bot both need **Manage Emojis and Stickers**. Animated emojis are subject to the server's boost tier; if Discord refuses one, the error is reported in the result.

## `/translate`

`target` accepts a language code (`es`, `pt-BR`, `ja`) or a common name (`Spanish`, `Japanese`, `Brazilian Portuguese`). Source language is detected automatically.

- Input is truncated to 2,000 characters.
- Output is truncated to 3,800 characters.
- Requests time out after 10 seconds.

Translation uses the public Google Translate `gtx` endpoint (`translate.googleapis.com`). The text you submit is sent to Google for translation; Lumi does not cache or store it.

## Permissions and intents

- `/steal`: **Manage Emojis and Stickers** for the invoker and the bot.
- `/steal` from a message link also needs the bot to be able to view that channel and read its message history.
- `/translate`: available to all members.
- No gateway intents are required. Message content is read through Discord's REST API only when a message link or ID is supplied.

## Privacy

No user data is stored. Emoji images are downloaded and uploaded in the moment, and translation text is forwarded to Google Translate only for that request. Nothing is written to module data.
