# Lumi — Live Test Checklist

Bot is running as a **monolith** on the host (Postgres/Redis/RabbitMQ in Docker),
online in your test guild. Work top to bottom. For each item: run it, tick the
box, and note anything unexpected — I'll be tailing the logs.

**Logs:** `boot-addons2.log` in the scratchpad. If something errors, copy the
`ERROR` line and the command you ran.

**Conventions**
- "Enable X" = `/lumi` → **Modules** tab → toggle **X** on.
- "Config X.field = Y" = `/lumi` → **Modules** → **X** → set that field.
- Most replies are **ephemeral** (only you see them). That's expected.

---

## 0. Preflight
- [x] `/ping` → replies with latency card.
- [x] `/help` → help card renders.
- [x] `/lumi` → hub opens; the tab bar (Overview / Settings / Permissions / Modules) is present and clickable.
- [22 entries total] `/lumi` → **Modules** → confirm all 12 addons appear in the list.

---

## 1. Core

### Hub & config
- [x] `/lumi` → **Settings** → change prefix, change language → re-open, values persisted.
- [here should have been a back button looks cluterred fix all like this, make this a bit more UX friedly looks a bit weird maybe use submenus to add properly or shit instead of modal and using latest comp v2 chooserole choose element choose chnanel shit] `/lumi` → **Permissions** → **Allow…** → pick a command + a role → it appears in the overrides list → remove it.

### Moderation (`mod` module) fix it most failed not checking further
- [ ] Enable **Moderation**.
- [warn failed] `/warn @dummy reason:test` → case card, case number.
- [failed] `/timeout @dummy 5m reason:test` → dummy muted; `/cases @dummy` shows it.
- [ ] `/kick` / `/ban` on a throwaway account (careful) → case logged.

### Utility / AFK / TempVC
- [ ] Enable **Utility**, **AFK**, **Temp Voice Channels**.
- [x ] `/afk reason:brb` → your nick gets `[AFK]`; send a message → cleared.
- [does  not show up as slash cmd ] `/nick @dummy newname` and `/purge 5` in a test channel.
- [looks good, add a explanation yk add a explanation block in /lumi config too so certain modules can explain their usage so uhh we can add use /tempvc wtvr to configurr shit and remove the blue sidebar neevr use blue sidebar prefer blank] Join the configured temp-VC generator channel → a personal VC is created; leave → it's removed.

### Filter / Logging
- [test it yourself somehow] Enable **Filter**; add a blocked word; post it → message actioned.
- [x add submenus for choosing like messages members vcs invites etc check what else can be logged ] Enable **Logging**; set log channel; do an action → event card appears.

---
### MAJOR SHIT configure should have a submenu or soemthing where only those stuff that cant be presented as comp v2 selection lists should be used as modals stuff like, remove the blue line shit please it looks creepy asf, 
check how we also had support for secondary coolor to make gradient roles. if server is boosted enough it should have option for gradient roles too
## 2. booster-roles  🎨
- [ ] Enable **Booster Roles**.
- [ ] Config: `anchor_role_id` = some mid role; `booster_role_ids` = your booster/any role you hold (so you qualify); optionally `showcase_channel_id`, `log_channel_id`.
- [ ] `/boosterrole` → panel shows "Create My Role".
- [ ] Click **Create** → modal → name it → role created, assigned to you, positioned under the anchor; showcase card posts (if set).
- [ ] `/boosterrole` again → panel now shows Rename / Recolour / Share / Manage Shares / Delete.
- [ ] **Rename** → modal → role renamed.
- [ ] **Recolour** → enter `#5865F2` → role colour changes. (Try an invalid colour → friendly error.)
- [ ] **Share** → pick @dummy → they get the role; **Manage Shares** → remove them → role stripped.
- [ ] **Delete** → confirm → role gone.
- [can we have a better way of doing this instead of adding a separate cmd ... hmm like just /boosterole stats and blclist should be mod only so yeah group em ig ] `/boosterrole-admin stats` / `list` / `info @you`.
- [ ] `/boosterrole-admin blacklist add @dummy` → they can't use `/boosterrole`; `blacklist remove` reverts.
- [ ] **Grace period:** set `grace_hours` low, remove your qualifying role → role should be cleaned up after grace (check log channel). Re-add the role before grace → cleanup cancelled.

## 3. confessions  🕊️
totaly nuked it check how og discord data had a image selection shit and all it had a title and all tey to do the same bruh
error for confession reply shit An unexpected error occurred. Reference: e3a16a9cf87d440e9943d40ab5e01468
titles only defualt if user added no title and shit bruh make UX better 
- [ ] Enable **Confessions**.
- [ ] Config: `confession_channel_id`, optionally `log_channel_id`, `auto_thread` on.
- [ ] `/confess` → modal → submit → numbered confession card posts anonymously; a thread opens.
- [ ] Click **Anonymous Reply** on the card → modal → reply posts as `#N.k`.
- [ ] Cooldown: `/confess` again immediately → "Slow Down".
- [ ] `/confessmod ban <number>` → that author blocked; `/confessmod list` shows the hash.
- [ ] `/confessmod delete <number>` → confession + thread removed; log card posts.

## 4. promoter  📣
i cant seem to make this to work check if it actully detcets statuses and shit like yeah check it once
- [ ] Enable **Promoter**. Requires the **Presence intent** (already on).
- [ ] Config: `promoter_role_id`, `match_terms` = e.g. `.gg/test`, `detect_server_tag` = on, `log_channel_id`.
- [ ] Put `.gg/test` in your **custom status** → within a moment (or after the sweep) you get the role; log card posts.
- [ ] Remove it from status → role revoked.
- [ the members update presence shit should also have this ig like change of server tag so chekc if you can make it simulataneous] **Server tag:** wear this server's tag next to your name → on the next sweep you get the role (tag changes don't fire instantly). Remove tag → revoked.
- [ ] `/promoter panel` (admin) → persistent card with "Check my status" button → click it.
- [ ] `/promoter stats` → grant/revoke counters.


looks good but the UI has bit of unmatced separators and shit
## 5. thread-cleaner  🧹
- [ ] Enable **Thread Cleaner**.
- [ ] Config: `enabled_channels` = a test channel ID; `inactive_duration` = `1m` for a quick test; `action` = archive.
- [ ] Create a thread in that channel → wait 1m → it auto-archives (check logs).
- [make it threadcleaner ] **Bulk sweep:** make a couple of empty threads. `/thread-cleaner sweep min_messages:1 scope:all` → confirmation card → **Run Sweep** → summary card posts (scanned/deleted/kept). Verify empty threads are gone.
- [ ] Try `strip_members:true` on a thread with an extra member added.



## 6. multi-lounge  🛋️
did not work 2 ids cehck the png in this dir
- [ ] Config: `base_channel_ids` = one voice channel ID; `busy_threshold` = 1 (for easy testing); `max_extra_lounges` = 2.
- [ ] Join the base VC → once it hits the threshold, a "Lounge 2" clone appears.
- [ ] Fill that too → "Lounge 3" (up to max). Leave → extras removed, base kept.
- [ ] `/lounge stats` → occupancy + lifetime counters.

## 7. verify  ✅
- [ ] Enable **Verify**.
- [ ] Config: `pending_role_id`, `verified_role_id`, `timeout_minutes`, `kick_on_timeout`, `log_channel_id`.
- [ ] `/verifytest` (or have a dummy re-join) → pending role assigned + captcha challenge.
- [ ] Solve the captcha → verified role granted, pending removed.
- [ ] Let one time out → member kicked (if `kick_on_timeout`), logged.

## 8. dragme  🎯
did not work check png and it is /dragme @user not channel okay
and the @user in channel also does not work
- [ ] Enable **Dragme**.
- [ ] Config: `request_channel_id`, `timeout_minutes`, `grace_minutes`, optionally `blacklist_role_ids`.
- [ ] From a voice channel, `/dragme channel:<target VC>` → request card posts; someone inside the target clicks approve → you're moved / granted a pass.
delete this not needed auto clear
- [ ] `/dragme-admin active` → lists open requests; `/dragme-admin clear`.

## 9. emoji-stealer  😀
- [ ] Enable **Emoji Stealer**.
- [ ] `/steal <emoji or message link or URL>` → emoji added to the server (needs Manage Emojis).
- [ ] Try each input form: a raw custom emoji, a message link, an image URL.

## 10. rolementions  🔔
/roleprotect cmd did not show up bleh
- [ ] Enable **Rolementions**.
- [ ] Config: `log_channel_id`, `auto_protect` on, `default_duration`.
- [ ] `/roleprotect add @role` → an AutoMod rule is created protecting it from mention spam.
- [ ] Mention that role a bunch → AutoMod triggers; stats accrue.
- [ ] `/roleprotect list` / `remove`.

## 11. activity-roles  🎮
it sent a empty comp v2 no sucess message and shit idk if it worked check if bot can see user shits 
- [ ] Enable **Activity Roles**.
- [ ] `/activityroles add type:Playing match:<game> role:@role` (MOD).
- [ ] Set your presence to Playing that game → role assigned; stop → removed.
- [ ] `/activityroles list` / `remove`.

## 12. auto-translate  🌐
make it that you can reply to a cmd with /transalte and it would translte it no need for mandtory text and as well as add a prefix ,tr whcih can be suceede by text or can be replied to a message to translte it got it?
- [ ] Enable **Auto Translate**.
- [ ] `/translate text:<foreign text>` → English translation card.
- [ ] Right-click a message → **Apps → Translate to English** → translation.

## 13. status  📊  (bot-owner only)
make it a bit more idk better like a proper dashboard for this or something a centralised cmd with mostly UI shit or soemthing yk 
- [ ] `/status add text:<msg> type:Playing presence:online` (BOT_OWNER) → added to rotation.
- [ ] `/status list` → shows entries; watch the bot's presence rotate.
- [ ] `/status remove id:<n>`.

---

## After testing
- Report anything that errored (command + log line).
- Bot + infra are left running. To stop later:
  `pkill -f apps/worker/src/main.ts && docker compose down`.
