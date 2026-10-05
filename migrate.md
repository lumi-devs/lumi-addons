# Migrating these addons to the Lumi 0.4 sandbox

This is a migration reference, not a migration. **No addon in this repo has been
changed.** It exists so the eight addons here can be ported deliberately, one at a
time, once the sandbox design below is approved and phases 1–7 of its implementation
plan have landed in `lumi`.

Read `/home/rebiz/opt/lumi/.lumi-0.4/design-sandbox.md` first — this file only maps
its capability model and API surface onto the addons that actually live here. It does
not repeat the design's reasoning.

## Why this exists

Lumi 0.4 replaces the addon loader's plain `import()` (which hands an addon the live
Discord client, Prisma, Redis, and `BOT_TOKEN` — confirmed unenforced today) with a
child-process-per-addon sandbox. Addon code no longer touches live discord.js objects
or raw service clients; it calls a set of RPC-backed facades (`lumi/discord`,
`lumi/interactions`, `lumi/kv`, `lumi/redis`, `lumi/scheduling` mostly unchanged,
`lumi/permissions`, `lumi/config`) and declares which of them it needs in
`manifest.json`'s `capabilities` block. This file is the per-addon punch list for that
port, derived by actually reading every file in each addon below — not guessed.

## Do this per addon, in this order

Ordered cheapest/lowest-risk to most-invasive, so early ports validate the SDK surface
before the addons that stress it hardest:

1. `activity-roles`
2. `promoter`
3. `rolementions`
4. `multi-lounge`
5. `dragme`
6. `confessions`
7. `booster-roles`
8. `economy-games` — **blocked** on design open question §10.4 (cross-module Economy
   ledger access) being resolved first; do not start this one until that's answered.

For each addon: read its `capabilities` needs below, add the `manifest.json` block,
replace every direct discord.js / `container.*` touch with the matching facade call,
run its existing test suite (`activity-roles`, `booster-roles`, `confessions`,
`economy-games`, `promoter`, `rolementions` all already have `.test.ts` files —
keep them green), then do a live smoke test against the dev bot per
`/home/rebiz/opt/lumi/.lumi-0.4/BRIEF.md`'s "Services" section.

## Per-addon capability + rewrite map

### activity-roles

- **Capabilities needed:** `manageRoles`.
- Presence-driven auto role assignment. `listeners/presenceUpdate.ts` reads live
  `Presence`/`GuildMember` off the gateway event — under the sandbox, presence events
  become a serialised payload (id, activities, member roles) relayed to the addon
  child, same shape as an interaction relay (design §4.2's pattern, applied to a
  listener instead of a component).
- `commands/activityroles.ts` is config/rule management only — pure `lumi/kv` +
  `lumi/config`, no rewrite risk.
- No scheduled tasks, no Redis, no cross-guild GDPR loop (already a no-op).
- Lowest-risk port: start here to validate the presence-listener relay pattern before
  anything that also needs Discord mutation capabilities.

### promoter

- **Capabilities needed:** `manageRoles`.
- `listeners/presenceUpdate.ts` + `listeners/userUpdate.ts`: same presence/user-event
  relay as activity-roles, plus a `userUpdate` (global profile change) relay — a second
  gateway event type that needs the same treatment; use activity-roles' port to nail
  the relay shape first, then extend it here rather than inventing a second mechanism.
- `scheduled-tasks/sweep.ts` + `registerTaskFireHandler("promoter-sweep", "broadcast",
  ...)`: unchanged per design §5 (scheduling row) — this is the existing Redis-Streams
  fire-handler pattern, already cross-process-safe.
- `interaction-handlers/checkButton.ts`: `lumi/interactions` port, reply-only.
- GDPR hooks are no-ops already (aggregate counters only) — nothing to touch there.

### rolementions

- **Capabilities needed:** `manageAutomod` (new capability — see design §6 and §10.6;
  confirm it's actually approved before this port starts), `manageRoles` is **not**
  needed (nothing here adds/removes roles — it only mentions-tracks and AutoMod-blocks).
- `lib/automod.ts` is the entire reason `manageAutomod` exists: `guild.autoModerationRules
  .{fetch,create}` and `rule.edit(...)`. Needs new `lumi/discord` methods —
  `discord.guilds.automod.ensureRule(...)`/`.syncRule(...)` or lower-level
  `fetch`/`create`/`edit` primitives — not yet designed in `design-sandbox.md` beyond
  naming the capability. **Do not invent the method shape unilaterally when porting
  this addon** — get the `lumi/discord` automod methods designed and reviewed first,
  since this is the one addon depending on them.
- Also uses `guild.members.me.permissions.has(...)` (bot's own member/permission
  check) and `container.redis` directly via `acquireRedisLock(container.redis, ...)` —
  the latter already has a dedicated SDK export (`lumi/utils`'s `acquireRedisLock`)
  that takes a client; under the sandbox it needs to take the narrowed `lumi.redis`
  facade instead of a raw `ioredis` client, which is a small signature change to
  `acquireRedisLock` itself, not just to this addon's call site — flag that when
  `lumi/utils` gets its sandboxed rewrite.
- `listeners/messageCreate.ts` (mention counting): same gateway-event relay pattern as
  activity-roles/promoter.
- `scheduled-tasks/RoleBlockExpireTask.ts`: unchanged scheduling pattern.

### multi-lounge

- **Capabilities needed:** `manageVoice` is **not** enough on its own — this addon
  **creates and deletes voice channels** (`guild.channels.create`, presumably
  `channel.delete`), which is a `manageChannels`-shaped action distinct from
  `manageVoice` (moving a member) in `design-sandbox.md`'s current capability list.
  **Second capability gap found during this port survey** (alongside `manageAutomod`)
  — raise `manageChannels` (create/delete channel) as an addition to design §6 before
  porting this addon; do not reuse `manageVoice` for it, the blast radius is different
  (creating/deleting infrastructure vs. moving one member).
- `listeners/voiceState.ts`: voice-state-change relay, same shape as the presence
  relay above but for `VoiceStateUpdate`.
- `scheduled-tasks/loungeReconcile.ts` +
  `registerTaskFireHandler("multi-lounge-reconcile", "broadcast", ...)`: unchanged.
- GDPR hooks are no-ops already.

### dragme

- **Capabilities needed:** `manageVoice` (member move — `requester.voice.setChannel(...)`
  in `interaction-handlers/requestButtons.ts:142`), plus permission-grant on a channel
  (`grant_hidden_perms` config: "Grant temporary Connect/ViewChannel permissions... and
  remove them when the user leaves" — this is a channel-permission-overwrite action,
  **a third capability gap**: neither `manageVoice` (member move) nor `manageChannels`
  (create/delete) covers editing a channel's permission overwrites. Needs its own
  facade method (`discord.channels.setUserOverwrite(...)`) and probably its own
  capability name, e.g. `manageChannelPermissions`. Raise this alongside
  `manageAutomod`/`manageChannels` before porting.
- `listeners/requestMessage.ts` + `listeners/voiceState.ts`: gateway-event relays.
- `scheduled-tasks/dragmeExpire.ts` (`unicast`) and `scheduled-tasks/dragmeRevoke.ts`
  (`unicast`): unchanged.
- GDPR hook (`deleteUserData`) uses `this.container.client.guilds.cache.keys()` — port
  to `lumi.discord.guilds.listInstalledIds()` per design §5.

### confessions

- **Capabilities needed:** `sendMessage`/`editMessage` (posting confessions/replies as
  the bot, not as an interaction reply — Components-v2 cards posted to a configured
  channel), plus thread creation (`auto_thread` config) — check whether thread creation
  needs its own facade method or fits under `sendMessage` extended to
  `channels.startThread(...)`; not yet resolved in the design, flag when porting.
  Optional-attachments handling (`allow_attachments`, `media_channel_id`
  re-hosting) needs the facade to support forwarding an attachment URL/buffer across
  the process boundary — attachments are binary, not JSON-serialisable inline, so this
  needs either a size-capped base64 field in the RPC payload or a two-step
  "upload to host, host re-hosts" call. **Not designed in `design-sandbox.md`** —
  raise as a follow-up open question before this port, since confessions is the one
  addon in this repo that touches attachments at all.
- Anonymous-hash moderation (`lib/anon.ts`) is pure crypto/data logic, no Discord
  touch — ports mechanically once `lumi/kv` is available.
- GDPR hooks: same `guilds.cache.keys()` → `listInstalledIds()` swap as dragme.
- No scheduled tasks.

### booster-roles

- **Capabilities needed:** `manageRoles` (create/recolor/delete a personal role,
  add/remove from a member) plus — like multi-lounge — **role creation** specifically
  (`guild.roles.create` appears in this addon's command flow per the design survey's
  grep of `lumi-addons/*`). Confirm whether `manageRoles` as scoped in
  `design-sandbox.md` §6 ("role add/remove") already covers role *creation*, or
  whether that needs to be spelled out explicitly — the design's current wording is
  ambiguous on this point and should be tightened before this port, not decided ad hoc
  here.
- `interaction-handlers/{modals,panel,shares}.ts`: the widest `lumi/interactions`
  surface in this repo — modal submit (recolor/rename), button panel (create/delete/
  share), and a share-management flow. Good addon to validate the full
  `lumi/interactions` surface against, once activity-roles/promoter have validated the
  listener-relay half of the SDK.
- `scheduled-tasks/{graceDelete,reconcile}.ts` +
  `registerTaskFireHandler(..., "broadcast", ...)` ×2: unchanged.
- GDPR hooks: `guilds.cache.keys()` swap, same as dragme/confessions. Full
  `exportUserData` implementation (owned + shared roles + blacklist status) — pure
  `lumi/kv` reads once the swap is done, no other rewrite needed.

### economy-games

- **Blocked** — see design §10.4. This addon calls `container.db.economy.{findAccount,
  ensureAccount,applyMutation}` (`lib/ledger.ts`) directly against the **core**
  Economy module's own repository, not its own KV namespace. Every other addon in
  this repo only ever touches its own `lumi.kv`/`lumi.redis` namespace; this one reads
  and writes another module's ledger. That is a different, unresolved question from
  "which Discord capability does this addon need" — do not start this port until the
  owner has decided whether economy-games becomes a trusted built-in or core Economy
  grows a narrow addon-facing RPC facade.
- Once unblocked: capabilities needed are `reply` (all game commands reply via
  `lumi/ui` cards already — no raw `EmbedBuilder` use anywhere in this addon, confirmed
  by grep across the whole repo) plus whatever the ledger-access resolution above
  settles on. `interaction-handlers/{blackjack-buttons,crime-select,roulette-select}.ts`
  are `lumi/interactions` ports with no Discord-entity-mutation surface beyond replies —
  mechanically straightforward once the ledger question is resolved.
- Cooldowns/game-state (`lib/store.ts`, `keys.ts`) are Redis-backed — narrowed
  `lumi.redis` facade, same as `giveaway` in the main design doc.

## Cross-cutting gaps this survey found (not just this repo's addons)

Three Discord-capability gaps surfaced only by reading every file in this repo, beyond
what `design-sandbox.md`'s original three-example survey covered. Each needs a design
decision **before** the addon that needs it is ported — they are listed above at their
first occurrence, collected here for visibility:

1. **`manageAutomod`** (rolementions) — AutoMod rule fetch/create/edit. Already named
   as a capability in `design-sandbox.md` §6, but the underlying `lumi/discord` method
   shapes are not designed yet.
2. **`manageChannels`** (multi-lounge) — channel create/delete, distinct from
   `manageVoice` (member move). Not yet named as a capability anywhere.
3. **`manageChannelPermissions`** (dragme) — per-user channel permission overwrites.
   Not yet named as a capability anywhere.
4. **Role creation** ambiguity (booster-roles, multi-lounge's channel-creation sibling
   concern) — whether `manageRoles` as currently scoped covers `guild.roles.create`,
   or needs to be split the way `manageChannels` was just split out from
   `manageVoice`.
5. **Attachment/binary payloads across the RPC boundary** (confessions) — no addon in
   `examples/*` touches attachments, so `design-sandbox.md`'s protocol section never
   had to address binary data. confessions does, so this can't stay undesigned once
   confessions is next in the port order.

None of these block phases 1–7 of the sandbox rollout (RPC transport, `AddonHost`,
`lumi/commands`+`lumi/discord` reply-only slice, `lumi/kv`, the full `giveaway`-driven
`lumi/discord`/`lumi/interactions` surface, resource limits, `validate.ts` rewrite) —
they only block the specific addons above within *this* repo's port order. Surface them
to the owner alongside `design-sandbox.md` rather than deciding them here.
