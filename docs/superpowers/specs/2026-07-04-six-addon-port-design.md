# Six-Addon Port — Design

**Date:** 2026-07-04
**Status:** Approved
**Scope:** Port five cogs from the legacy Python bot (`../discord-data/cogs`) as
professional Lumi addons, plus one new addon: `status`, `dragme`, `promoter`,
`multi-lounge`, `confessions`, `booster-roles`.

## Goals

- Professional-core ports: keep the real feature of each cog, drop one-server
  cruft (JSON migration, SQLite backup/export, hidden debug commands,
  hardcoded IDs, decorative channel-name art).
- Everything config-driven per guild via `cfg.*` schemas — zero hardcoded IDs
  or env-var feature config.
- Components v2 cards for every user-facing reply.
- One commit per addon; typecheck + lint green per phase.

## Non-goals

- Split-role (gateway/worker) presence support for `status` (documented
  limitation — works on `monolith`).
- Feature parity with legacy admin/debug/export tooling.
- Dashboard UI work beyond what the derived `ConfigField[]` already provides.

## Shared conventions

Every addon is a top-level directory in this repo mirroring `verify/`:

- `info.json` — `{ name, author: ["Antigravity"], description, short, version: "1.0.0" }`.
- `index.ts` — module class with `@DefineModule({ name, displayName, emoji, version, description, configSchema })`; `configSchema` built with `cfg.object({...})` helpers only (never hand-authored `configFields`). `deleteUserData` implemented wherever per-user data exists.
- `keys.ts` — all Redis keys and TTLs for the addon; no inline key strings.
- Sub-stores as needed: `commands/`, `listeners/`, `interaction-handlers/`, `scheduled-tasks/` (exact name — never `tasks/`), `services/`, plus plain `lib/` and `ui/` helpers.

Rules:

- **Storage:** durable state → module KV (`container.db` → `getModuleData` / `setModuleData` / `listModuleData` / `deleteModuleData`, keyed `guildId + module + targetId + key`); live/ephemeral state → Redis with TTL under `keys.ts` keys.
- **Timing:** BullMQ via `RelayTask` piece (empty body) + `registerTaskFireHandler` in `lib/`, stable `customJobOptions.jobId` for idempotency; `CatchUpMeta` where firing after downtime is wrong.
- **Concurrency:** per-guild mutations serialize through the guild transaction (`#lib/guild-transaction.js`).
- **UI:** `makeInfoCard` / `makeSuccessCard` / `makeErrorCard` / `makeWarningCard` / `makeListCard`; `this.replySuccess`-family helpers; `@discordjs/formatters` for mentions/timestamps; `chunk()` + `Page X/Y` footer pagination; button-nav pattern from `afk/interaction-handlers/mentions.ts` for multi-page.
- **Commands:** `BaseCommand` / `BaseSubcommand` with `permissionLevel`; never raw `interaction.reply`.
- **Listeners:** `ModuleListener` / `GuildMessageListener`; raw Sapphire `Listener` only when the addon must act while disabled.
- **Services:** `Service` pieces with `Services` interface augmentation; retrieved via `getService` / `tryGetService`.

## Addon 1 — `status` (presence rotator)

New design (legacy cog was a hardcoded string list on a 2-min loop).

- **Scope:** global, not per-guild. Presence is bot-wide.
- **Command:** `/status` (`BaseSubcommand`, `permissionLevel: BOT_OWNER`):
  - `add <text> [type] [presence]` — type ∈ Custom (default) / Playing / Watching / Listening / Competing; presence ∈ online / idle (default) / dnd.
  - `remove <id>`, `list` (paginated card showing id, text, type, presence), `interval <duration>` (parsed with `Duration`), `toggle`, `preview` (applies one rotation immediately).
- **Placeholders:** `{guilds}`, `{users}`, `{shard}` resolved when the presence is applied.
- **Storage:** entries in module KV under a global sentinel scope (`guildId = "global"`, `targetId = "status"`); each entry `{ id, text, type, presence, addedBy, addedAt }`.
- **Rotation:** repeated scheduled task at the configured interval; fire handler keeps a shuffled no-immediate-repeat queue (Redis) and calls `client.user.setPresence`.
- **Config schema:** `enabled` boolean, default interval.
- **Limitation (README):** requires the process to own the WS — works on `monolith`; gateway/worker split unsupported for now.
- **GDPR:** none (no per-user data beyond `addedBy` audit field; `deleteUserData` scrubs it).

## Addon 2 — `dragme` (voice drag requests)

- **Config:** request channel (`cfg.channel`), request timeout minutes (`cfg.number`), temp-connect grace minutes (`cfg.number`), blacklisted role IDs (`cfg.string({ list: true })`, read via `getConfigList`).
- **Entry points:** `/dragme <voice-channel>` command; plus `GuildMessageListener` on the request channel accepting a user mention/ID (drag *me to where X is*) — the legacy message-trigger flow, cleaned up: invalid messages get a short-lived hint card and are deleted.
- **Flow:** posts a v2 card "X wants to be dragged into Y" with Accept / Decline buttons. Button presses are honored only from members currently connected to the target voice channel (checked in the interaction handler). Accept → requester in voice: `member.voice.setChannel(target)`; not in voice: temporary connect permission overwrite, reverted by a one-shot scheduled task after the grace period. Decline → card updated, requester notified.
- **State:** active request per user in Redis (TTL = timeout); one-shot scheduled task expires the request and edits the card to "expired". Blacklisted-role members can't request.
- **Admin:** `/dragme-admin active | clear` (`MOD`).
- **GDPR:** delete the user's active-request Redis keys.

## Addon 3 — `promoter` (status-advertising role)

- **Config:** promoter role (`cfg.role`), log channel (`cfg.channel`), match terms (`cfg.string({ list: true })` — invite slugs / server tag), sweep interval minutes (`cfg.number`).
- **Detection:** `presenceUpdate` listener extracts the member's custom-status text, matches case-insensitively against the term list → grant role (log card "promoted") or remove role (log card "demoted"). Offline members are never demoted for being offline alone (mirrors legacy behavior: status unreadable ≠ removed; the sweep handles real removals).
- **Self-heal:** repeated scheduled task sweeps role holders whose status no longer matches and online matching members missing the role.
- **Panel:** `/promoter panel` (`ADMIN`) posts a persistent v2 info card explaining the perk with a "Check my status" button; interaction handler re-evaluates the clicker immediately and replies ephemerally.
- **Stats:** grant/revoke counters in module KV; `/promoter stats` (`MOD`) card.
- **GDPR:** delete the user's grant-record KV rows.

## Addon 4 — `multi-lounge` (auto-scaling voice lounges)

- **Config:** base lounge channel (`cfg.channel`), busy threshold users (`cfg.number`), max extra lounges (`cfg.number`), name template (`cfg.string`, default `Lounge {n}`), creation cooldown seconds (`cfg.number`).
- **Engine:** `voiceStateUpdate` `ModuleListener` → `LoungeService` evaluates under the per-guild guild-transaction lock:
  - every managed lounge (base + extras) has ≥ threshold users → clone the base channel (inherits category, permissions, bitrate, user limit), named from the template with the next free number, respecting max-extras and the creation cooldown;
  - an extra lounge is empty → delete it (the base is never deleted); numbering stays contiguous by always allocating the lowest free `{n}`.
- **Registry:** managed extra-channel IDs in module KV so restarts don't orphan; `onLoad` reconcile deletes registered channels that are now empty/missing and drops stale registry entries.
- **Stats:** creations / deletions / peak concurrent users in module KV; `/lounge stats` (`MOD`) card.
- **GDPR:** none (no per-user data).

## Addon 5 — `confessions` (anonymous confessions)

- **Config:** confession channel (`cfg.channel`), log channel (`cfg.channel`), auto-thread (`cfg.boolean`), allow attachments (`cfg.boolean`), per-user cooldown minutes (`cfg.number`).
- **Submit:** `/confess` → modal (confession text + optional attachment URL when enabled) → numbered anonymous v2 card (`Confession #N`) in the confession channel; auto-thread `Confession #N` when enabled. Card carries an "Anonymous Reply" button.
- **Replies:** reply button → modal → anonymous reply card in the thread, numbered `#N.k`; reply cards carry their own reply button (reply-to-reply), same numbering scheme.
- **Numbering:** per-guild counter in module KV, incremented inside the guild transaction (no Redis-only counters — must survive cache flushes).
- **Anonymity model:** author identity is stored only as `SHA-256(guildSalt + userId)`; the per-guild salt lives in module KV, generated on first use. A `confession/reply → authorHash` map (module KV, `targetId = confession id`) enables moderation without identity exposure. Cooldown tracking in Redis keyed by the hash.
- **Moderation:** `/confessmod` (`MOD`): `ban <number>` (bans the submitting hash), `unban <number|hash>`, `list` (banned hashes card), `delete <number>` (removes message + thread starter, logs). Banned hashes are rejected at submit with an ephemeral error card. Log channel receives moderation-event cards — never author identity.
- **GDPR:** compute the requesting user's hash per guild and delete matching KV rows (author maps, cooldowns, bans).

## Addon 6 — `booster-roles` (personal roles for boosters)

- **Config:** anchor role (`cfg.role` — new roles are created just below it), max shares per booster (`cfg.number`), log channel (`cfg.channel`), allow role icons (`cfg.boolean`), removal grace period hours (`cfg.number`).
- **Booster surface:** `/boosterrole` opens a personal panel card (v2):
  - **Create / Edit** → modal: role name, hex color, optional icon URL (validated; icon only when the guild supports it and config allows).
  - **Share** → user select, capped at max-shares; **Unshare** → select from current holders.
  - **Renounce** → confirm button; deletes the role.
  - Panel shows current role, color swatch, share list, created/edited timestamps.
- **Admin surface:** `/boosterrole-admin` (`ADMIN`): `stats`, `list` (paginated), `info <role>`, `delete <role> [reason]`, `blacklist add|remove|list <user>`. Blacklisted users can't create or receive shared roles.
- **Data:** one KV record per owner (`targetId = ownerId`): `{ roleId, ownerId, sharedWith: string[], createdAt, lastEditAt }`; blacklist as KV rows (`targetId = userId`).
- **Cleanup:**
  - `guildMemberUpdate` listener catches boost loss (`premiumSince` → null) → schedules a one-shot removal task after the configured grace period (cancelled if they re-boost; `CatchUpMeta` so a fire missed during downtime still runs).
  - Repeated 12h reconcile task: deletes orphaned roles (owner left / stopped boosting past grace), drops records whose role was deleted manually, strips shares from members who left.
  - All removals produce log-channel cards.
- **Dropped from legacy:** JSON migration, SQLite backup/export, hidden prefix debug commands, `tashelp`.
- **GDPR:** renounce the user's role, purge their record, remove them from any `sharedWith` lists and the blacklist.

## Error handling

- Discord API failures (missing permissions, deleted channels/roles) reply with `makeErrorCard` and log at `warn`; background tasks catch per-item and continue the sweep.
- Misconfiguration (unset required channel/role) → ephemeral warning card telling an admin which `/config` field to set; listeners no-op silently.
- All interaction handlers validate that their subject state still exists (request not expired, confession not deleted, role record present) before acting.

## Testing

- `bun run typecheck` and `bun run lint` in this repo must pass after every addon.
- Pure logic extracted into `lib/` for unit testing where the repo's test setup allows (hash/salt helpers, placeholder resolution, lounge numbering, status queue no-repeat).
- Manual verification per addon against a dev guild before commit.

## Implementation order

`status` → `dragme` → `promoter` → `multi-lounge` → `confessions` → `booster-roles`; one commit per addon.
