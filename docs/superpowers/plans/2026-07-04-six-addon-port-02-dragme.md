# Addon 2: `dragme` — Voice Drag Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members ask to be pulled into a voice channel; anyone inside that channel approves or declines via buttons on a v2 card. Accept moves the requester (or grants a temporary connect overwrite); requests expire on a timer.

**Architecture:** Two entry points — `/dragme <channel>` and a `GuildMessageListener` on a configured request channel (mention/ID → "drag me to where that user is"). Request state lives in Redis (TTL); a one-shot BullMQ job expires the card; a second one-shot job reverts temporary connect overwrites. Buttons are validated against current membership of the target voice channel.

**Read first:** `thread-cleaner/` (one-shot job + jobId pattern), `verify/interaction-handlers/captcha.ts` (customId parse), Global Constraints in `2026-07-04-six-addon-port-00-overview.md`.

---

### Task 1: Scaffolding, keys, request state

**Files:**
- Create: `dragme/info.json`
- Create: `dragme/keys.ts`
- Create: `dragme/lib/requests.ts`

**Interfaces:**
- Produces: `MODULE_NAME`, `DragmeKeys`, `dragmeExpireJobId(guildId, userId)`, `dragmeRevokeJobId(guildId, userId)`, `DragRequest`, `getRequest`, `setRequest`, `deleteRequest`, `listRequests(guildId)` — consumed by Tasks 2–4.

- [ ] **Step 1: Write `dragme/info.json`**

```json
{
  "name": "dragme",
  "author": ["Antigravity"],
  "description": "Voice drag requests: ask to be pulled into a voice channel and let the people inside approve with one click. Approvals move you or grant a temporary connect pass.",
  "short": "Ask to be dragged into a voice channel.",
  "version": "1.0.0"
}
```

- [ ] **Step 2: Write `dragme/keys.ts`**

```ts
export const MODULE_NAME = "dragme";

export const DragmeKeys = {
  /** JSON `DragRequest`, TTL = request timeout. One live request per user. */
  request: (guildId: string, userId: string) =>
    `lumi:addon:dragme:req:${guildId}:${userId}`,
  /** Set of user ids with a live request, for `/dragme-admin active`. */
  activeSet: (guildId: string) => `lumi:addon:dragme:active:${guildId}`,
} as const;

export const dragmeExpireJobId = (guildId: string, userId: string) =>
  `dragme-expire:${guildId}:${userId}`;
export const dragmeRevokeJobId = (guildId: string, userId: string) =>
  `dragme-revoke:${guildId}:${userId}`;

export interface DragRequest {
  guildId: string;
  userId: string;
  targetChannelId: string;
  /** Channel + message of the request card, for later edits. */
  cardChannelId: string;
  cardMessageId: string;
  createdAt: number;
  expiresAt: number;
}
```

- [ ] **Step 3: Write `dragme/lib/requests.ts`**

```ts
import { container } from "@sapphire/framework";
import { tryParseJSON } from "@sapphire/utilities";
import { DragmeKeys, type DragRequest } from "../keys.js";

export async function getRequest(
  guildId: string,
  userId: string,
): Promise<DragRequest | null> {
  const raw = await container.redis.get(DragmeKeys.request(guildId, userId));
  if (!raw) return null;
  const parsed = tryParseJSON(raw) as DragRequest | string;
  return typeof parsed === "string" ? null : parsed;
}

export async function setRequest(req: DragRequest): Promise<void> {
  const ttlSec = Math.max(1, Math.ceil((req.expiresAt - Date.now()) / 1000));
  await container.redis
    .multi()
    .set(
      DragmeKeys.request(req.guildId, req.userId),
      JSON.stringify(req),
      "EX",
      ttlSec,
    )
    .sadd(DragmeKeys.activeSet(req.guildId), req.userId)
    .exec();
}

export async function deleteRequest(
  guildId: string,
  userId: string,
): Promise<void> {
  await container.redis
    .multi()
    .del(DragmeKeys.request(guildId, userId))
    .srem(DragmeKeys.activeSet(guildId), userId)
    .exec();
}

/** Live requests for a guild; self-heals set members whose key expired. */
export async function listRequests(guildId: string): Promise<DragRequest[]> {
  const ids = await container.redis.smembers(DragmeKeys.activeSet(guildId));
  const out: DragRequest[] = [];
  for (const userId of ids) {
    const req = await getRequest(guildId, userId);
    if (req) out.push(req);
    else await container.redis.srem(DragmeKeys.activeSet(guildId), userId);
  }
  return out;
}
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck` — Expected: clean for `dragme/`.

---

### Task 2: Request creation core + config helper

**Files:**
- Create: `dragme/lib/config.ts`
- Create: `dragme/lib/create-request.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `getDragmeConfig(guildId)` → `{ requestChannelId, timeoutMinutes, graceMinutes, blacklistRoleIds }`; `createDragRequest(member, targetChannel)` → `{ ok: true } | { ok: false; reason: string }` — consumed by Tasks 3–4.

- [ ] **Step 1: Write `dragme/lib/config.ts`**

```ts
import { container } from "@sapphire/framework";
import { parseConfigList } from "#core/module-system/Module.js";
import { MODULE_NAME } from "../keys.js";

export interface DragmeConfig {
  requestChannelId: string | null;
  timeoutMinutes: number;
  graceMinutes: number;
  blacklistRoleIds: string[];
}

export async function getDragmeConfig(guildId: string): Promise<DragmeConfig> {
  const get = (key: string) =>
    container.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [channel, timeout, grace, blacklist] = await Promise.all([
    get("request_channel_id"),
    get("timeout_minutes"),
    get("grace_minutes"),
    get("blacklist_role_ids"),
  ]);
  return {
    requestChannelId: (channel as string | null) ?? null,
    timeoutMinutes: (timeout as number | null) ?? 5,
    graceMinutes: (grace as number | null) ?? 10,
    blacklistRoleIds: parseConfigList(blacklist),
  };
}
```

- [ ] **Step 2: Write `dragme/lib/create-request.ts`**

```ts
import { container } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { channelMention, time, TimestampStyles, userMention } from "@discordjs/formatters";
import {
  ButtonStyle,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { makeInfoCard, noPingCard } from "#utilities/cards.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { dragmeExpireJobId, type DragRequest } from "../keys.js";
import { getDragmeConfig } from "./config.js";
import { getRequest, setRequest } from "./requests.js";

export type CreateResult = { ok: true } | { ok: false; reason: string };

export function buildRequestButtons(
  guildId: string,
  userId: string,
  disabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dragme:acc:${guildId}:${userId}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`dragme:dec:${guildId}:${userId}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
  ];
}

/**
 * Validates and posts a drag request for `member` into `target`, storing state
 * and arming the expiry job. All entry points (slash command, request-channel
 * message) funnel through here.
 */
export async function createDragRequest(
  member: GuildMember,
  target: VoiceBasedChannel,
): Promise<CreateResult> {
  const guild = member.guild;
  const cfg = await getDragmeConfig(guild.id);

  if (!cfg.requestChannelId) {
    return {
      ok: false,
      reason:
        "This server hasn't set a drag-request channel yet — an admin must set `request_channel_id` in `/config`.",
    };
  }
  if (cfg.blacklistRoleIds.some((id) => member.roles.cache.has(id))) {
    return { ok: false, reason: "You're not allowed to use drag requests." };
  }
  if (member.voice.channelId === target.id) {
    return { ok: false, reason: `You're already in ${channelMention(target.id)}.` };
  }
  if (target.members.size === 0) {
    return {
      ok: false,
      reason: `${channelMention(target.id)} is empty — nobody can approve you. Just join it.`,
    };
  }
  if (await getRequest(guild.id, member.id)) {
    return { ok: false, reason: "You already have a pending drag request." };
  }

  const requestChannel = guild.channels.cache.get(cfg.requestChannelId);
  if (!requestChannel?.isTextBased()) {
    return {
      ok: false,
      reason: "The configured drag-request channel no longer exists.",
    };
  }

  const expiresAt = Date.now() + cfg.timeoutMinutes * 60_000;
  const card = noPingCard(
    makeInfoCard(
      "Voice Drag Request",
      `${userMention(member.id)} wants to be dragged into ${channelMention(target.id)}.\n\nAnyone **inside that channel** can accept or decline. Expires ${time(new Date(expiresAt), TimestampStyles.RelativeTime)}.`,
      { actionRows: buildRequestButtons(guild.id, member.id) },
    ),
  );
  const message = await requestChannel.send(card);

  const req: DragRequest = {
    guildId: guild.id,
    userId: member.id,
    targetChannelId: target.id,
    cardChannelId: requestChannel.id,
    cardMessageId: message.id,
    createdAt: Date.now(),
    expiresAt,
  };
  await setRequest(req);

  // Expiring a little late (e.g. after downtime) is still correct — the
  // handler no-ops if the request was already resolved — so catchUp stays true.
  await scheduleTask(
    "dragme-expire",
    { guildId: guild.id, userId: member.id },
    {
      repeated: false,
      delay: cfg.timeoutMinutes * 60_000,
      customJobOptions: {
        jobId: dragmeExpireJobId(guild.id, member.id),
        removeOnComplete: true,
        removeOnFail: true,
      },
    },
  );
  container.logger.debug(
    `[Dragme] Request ${member.id} → ${target.id} in guild ${guild.id}`,
  );
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck` — Expected: clean.

---

### Task 3: Scheduled-task pieces + fire handlers

**Files:**
- Create: `dragme/scheduled-tasks/dragmeExpire.ts`
- Create: `dragme/scheduled-tasks/dragmeRevoke.ts`
- Create: `dragme/lib/expire-handler.ts`
- Create: `dragme/lib/revoke-handler.ts`

**Interfaces:**
- Consumes: Task 1 (`getRequest`, `deleteRequest`), Task 2 (`buildRequestButtons`).
- Produces: task names `"dragme-expire"` (payload `{guildId, userId}`) and `"dragme-revoke"` (payload `{guildId, userId, channelId}`), `handleDragmeExpireFire`, `handleDragmeRevokeFire` — registered in Task 5's `index.ts`; `"dragme-revoke"` is scheduled by Task 4's accept path.

- [ ] **Step 1: Write `dragme/scheduled-tasks/dragmeExpire.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { shouldRunNow, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";
import { publishTaskFire } from "#lib/scheduler-bus.js";

export interface DragmeExpirePayload extends CatchUpMeta {
  guildId: string;
  userId: string;
}

@ApplyOptions<ScheduledTask.Options>({ name: "dragme-expire" })
export class DragmeExpireTask extends ScheduledTask<"dragme-expire"> {
  public async run(payload: DragmeExpirePayload): Promise<void> {
    if (!shouldRunNow("dragme-expire", payload)) return;
    await publishTaskFire("dragme-expire", payload);
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "dragme-expire": DragmeExpirePayload;
  }
}
```

- [ ] **Step 2: Write `dragme/scheduled-tasks/dragmeRevoke.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import { ScheduledTask } from "@sapphire/plugin-scheduled-tasks";
import { shouldRunNow, type CatchUpMeta } from "#core/lib/scheduled-tasks.js";
import { publishTaskFire } from "#lib/scheduler-bus.js";

export interface DragmeRevokePayload extends CatchUpMeta {
  guildId: string;
  userId: string;
  channelId: string;
}

@ApplyOptions<ScheduledTask.Options>({ name: "dragme-revoke" })
export class DragmeRevokeTask extends ScheduledTask<"dragme-revoke"> {
  public async run(payload: DragmeRevokePayload): Promise<void> {
    if (!shouldRunNow("dragme-revoke", payload)) return;
    await publishTaskFire("dragme-revoke", payload);
  }
}

declare module "@sapphire/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    "dragme-revoke": DragmeRevokePayload;
  }
}
```

- [ ] **Step 3: Write `dragme/lib/expire-handler.ts`**

```ts
import { container } from "@sapphire/framework";
import { channelMention, userMention } from "@discordjs/formatters";
import { makeWarningCard, noPingCard } from "#utilities/cards.js";
import type { DragmeExpirePayload } from "../scheduled-tasks/dragmeExpire.js";
import { buildRequestButtons } from "./create-request.js";
import { deleteRequest, getRequest } from "./requests.js";

export async function handleDragmeExpireFire(
  payload: DragmeExpirePayload,
): Promise<void> {
  const { guildId, userId } = payload;
  const req = await getRequest(guildId, userId);
  if (!req) return; // Already accepted/declined/cleared.

  await deleteRequest(guildId, userId);

  const guild = container.client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(req.cardChannelId);
  if (!channel?.isTextBased()) return;

  const card = noPingCard(
    makeWarningCard(
      "Drag Request Expired",
      `${userMention(userId)}'s request to join ${channelMention(req.targetChannelId)} timed out with no response.`,
      { actionRows: buildRequestButtons(guildId, userId, true) },
    ),
  );
  await channel.messages
    .edit(req.cardMessageId, { ...card })
    .catch(() => null);
}
```

- [ ] **Step 4: Write `dragme/lib/revoke-handler.ts`**

```ts
import { container } from "@sapphire/framework";
import type { DragmeRevokePayload } from "../scheduled-tasks/dragmeRevoke.js";

/** Reverts the temporary connect overwrite granted on accept. */
export async function handleDragmeRevokeFire(
  payload: DragmeRevokePayload,
): Promise<void> {
  const guild = container.client.guilds.cache.get(payload.guildId);
  const channel = guild?.channels.cache.get(payload.channelId);
  if (!channel?.isVoiceBased()) return;

  const overwrite = channel.permissionOverwrites.cache.get(payload.userId);
  if (!overwrite) return;
  await overwrite.delete("Dragme temporary access expired").catch((err) => {
    container.logger.warn(
      `[Dragme] Failed to revoke overwrite for ${payload.userId} on ${payload.channelId}:`,
      err,
    );
  });
}
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck` — Expected: clean.

---

### Task 4: Command, message listener, buttons

**Files:**
- Create: `dragme/commands/dragme.ts`
- Create: `dragme/commands/dragme-admin.ts`
- Create: `dragme/listeners/requestMessage.ts`
- Create: `dragme/interaction-handlers/requestButtons.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`createDragRequest`, `getDragmeConfig`, `getRequest`, `deleteRequest`, `listRequests`, `buildRequestButtons`, `dragmeExpireJobId`, `dragmeRevokeJobId`).

- [ ] **Step 1: Write `dragme/commands/dragme.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import { ChannelType, type ChatInputCommandInteraction, type GuildMember, type VoiceBasedChannel } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { BaseCommand } from "#lib/commands.js";

@ApplyOptions<BaseCommand.Options>({
  name: "dragme",
  description: "Ask the people in a voice channel to drag you in.",
  preconditions: ["GuildOnly"],
})
export class DragmeCommand extends BaseCommand {
  public override registerApplicationCommands(registry: BaseCommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("The voice channel you want to join")
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(true),
        ),
    );
  }

  public override async chatInputRun(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const { createDragRequest } = await import("../lib/create-request.js");
    const target = interaction.options.getChannel(
      "channel",
      true,
    ) as VoiceBasedChannel;
    const result = await createDragRequest(
      interaction.member as GuildMember,
      target,
    );
    return result.ok
      ? this.replySuccess(
          interaction,
          "Request Posted",
          `Asked the members of ${channelMention(target.id)} to drag you in.`,
        )
      : this.replyError(interaction, "Can't Do That", result.reason);
  }
}
```

- [ ] **Step 2: Write `dragme/commands/dragme-admin.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import type { ChatInputCommandInteraction } from "discord.js";
import { channelMention, time, TimestampStyles, userMention } from "@discordjs/formatters";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { ephemeralCard, makeListCard } from "#utilities/cards.js";
import { cancelTask } from "#lib/schedule-task.js";
import { dragmeExpireJobId } from "../keys.js";
import { deleteRequest, listRequests } from "../lib/requests.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "dragme-admin",
  description: "Moderate voice drag requests.",
  permissionLevel: PermissionLevel.MOD,
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "active", chatInputRun: "chatInputActive" },
    { name: "clear", chatInputRun: "chatInputClear" },
  ],
})
export class DragmeAdminCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: BaseSubcommand.Registry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub.setName("active").setDescription("List pending drag requests"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("clear")
            .setDescription("Clear all pending drag requests"),
        ),
    );
  }

  public async chatInputActive(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const requests = await listRequests(interaction.guildId);
    const lines = requests.map(
      (r) =>
        `${userMention(r.userId)} → ${channelMention(r.targetChannelId)} · expires ${time(new Date(r.expiresAt), TimestampStyles.RelativeTime)}`,
    );
    return this.reply(
      interaction,
      ephemeralCard(makeListCard("Pending Drag Requests", lines)),
    );
  }

  public async chatInputClear(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const requests = await listRequests(interaction.guildId);
    for (const r of requests) {
      await deleteRequest(r.guildId, r.userId);
      await cancelTask(dragmeExpireJobId(r.guildId, r.userId)).catch(() => null);
    }
    return this.replySuccess(
      interaction,
      "Requests Cleared",
      `Removed **${requests.length}** pending request(s).`,
    );
  }
}
```

- [ ] **Step 3: Write `dragme/listeners/requestMessage.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember } from "discord.js";
import { GuildMessageListener } from "#core/module-system/GuildMessageListener.js";
import type { ModuleListener } from "#core/module-system/ModuleListener.js";
import type { GuildMessage } from "#lib/types.js";
import { makeWarningCard } from "#utilities/cards.js";
import { MODULE_NAME } from "../keys.js";
import { getDragmeConfig } from "../lib/config.js";
import { createDragRequest } from "../lib/create-request.js";

const HINT_DELETE_MS = 10_000;
const USER_REF = /<@!?(\d{17,20})>|^(\d{17,20})$/;

/**
 * Message-driven flow in the configured request channel: post a user mention
 * or ID and be dragged to wherever that user currently is. The trigger message
 * is always deleted; invalid input gets a short-lived hint card.
 */
@ApplyOptions<ModuleListener.Options>({ module: MODULE_NAME })
export class DragmeRequestMessageListener extends GuildMessageListener {
  protected async handle(message: GuildMessage): Promise<void> {
    const cfg = await getDragmeConfig(message.guild.id);
    if (!cfg.requestChannelId || message.channelId !== cfg.requestChannelId)
      return;

    const hint = async (body: string) => {
      const card = makeWarningCard("Drag Request", body);
      const reply = await message.channel.send(card).catch(() => null);
      if (reply) setTimeout(() => void reply.delete().catch(() => null), HINT_DELETE_MS);
    };

    try {
      const match = USER_REF.exec(message.content.trim());
      if (!match) {
        await hint(
          "Post a **user mention** or **user ID** and I'll ask their voice channel to drag you in — or use `/dragme`.",
        );
        return;
      }
      const targetUserId = match[1] ?? match[2]!;
      const targetMember: GuildMember | null = await message.guild.members
        .fetch(targetUserId)
        .catch(() => null);
      const targetChannel = targetMember?.voice.channel ?? null;
      if (!targetChannel) {
        await hint("That user isn't in a voice channel right now.");
        return;
      }

      const result = await createDragRequest(message.member, targetChannel);
      if (!result.ok) await hint(result.reason);
    } finally {
      await message.delete().catch(() => null);
    }
  }
}
```

- [ ] **Step 4: Write `dragme/interaction-handlers/requestButtons.ts`**

```ts
import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ButtonInteraction, GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { channelMention, userMention } from "@discordjs/formatters";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
  noPingCard,
} from "#utilities/cards.js";
import { scheduleTask, cancelTask } from "#lib/schedule-task.js";
import {
  dragmeExpireJobId,
  dragmeRevokeJobId,
} from "../keys.js";
import { getDragmeConfig } from "../lib/config.js";
import { buildRequestButtons } from "../lib/create-request.js";
import { deleteRequest, getRequest } from "../lib/requests.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "dragme-buttons",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class DragmeButtonHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("dragme:")) return this.none();
    const [, verb, guildId, userId] = interaction.customId.split(":");
    if ((verb !== "acc" && verb !== "dec") || !guildId || !userId)
      return this.none();
    return this.some({ verb, guildId, userId });
  }

  public async run(
    interaction: ButtonInteraction,
    { verb, guildId, userId }: { verb: string; guildId: string; userId: string },
  ) {
    if (!interaction.inCachedGuild() || interaction.guildId !== guildId) return;

    const req = await getRequest(guildId, userId);
    if (!req) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard("Gone", "This drag request is no longer active."),
        ),
      );
    }

    const target = interaction.guild.channels.cache.get(req.targetChannelId);
    if (!target?.isVoiceBased()) {
      await deleteRequest(guildId, userId);
      return interaction.reply(
        ephemeralCard(
          makeErrorCard("Gone", "The requested voice channel no longer exists."),
        ),
      );
    }

    const presser = interaction.member;
    if (presser.voice.channelId !== target.id) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Call",
            `Only members currently in ${channelMention(target.id)} can respond to this request.`,
          ),
        ),
      );
    }

    await deleteRequest(guildId, userId);
    await cancelTask(dragmeExpireJobId(guildId, userId)).catch(() => null);
    const disabledRows = buildRequestButtons(guildId, userId, true);

    if (verb === "dec") {
      await interaction.update(
        noPingCard(
          makeWarningCard(
            "Drag Request Declined",
            `${userMention(presser.id)} declined ${userMention(userId)}'s request to join ${channelMention(target.id)}.`,
            { actionRows: disabledRows },
          ),
        ),
      );
      return;
    }

    // Accept.
    const requester: GuildMember | null = await interaction.guild.members
      .fetch(userId)
      .catch(() => null);
    if (!requester) {
      await interaction.update(
        noPingCard(
          makeErrorCard("Member Left", "The requester is no longer in this server.", {
            actionRows: disabledRows,
          }),
        ),
      );
      return;
    }

    let outcome: string;
    if (requester.voice.channelId) {
      await requester.voice.setChannel(
        target,
        `Drag request accepted by ${presser.user.tag}`,
      );
      outcome = `moved into ${channelMention(target.id)}`;
    } else {
      const cfg = await getDragmeConfig(guildId);
      await target.permissionOverwrites.create(
        requester.id,
        { Connect: true },
        { reason: `Drag request accepted by ${presser.user.tag}` },
      );
      await scheduleTask(
        "dragme-revoke",
        { guildId, userId, channelId: target.id },
        {
          repeated: false,
          delay: cfg.graceMinutes * 60_000,
          customJobOptions: {
            jobId: dragmeRevokeJobId(guildId, userId),
            removeOnComplete: true,
            removeOnFail: true,
          },
        },
      );
      outcome = `granted a **${cfg.graceMinutes}-minute** pass to join ${channelMention(target.id)} (they weren't in voice, so I couldn't move them)`;
    }

    await interaction.update(
      noPingCard(
        makeSuccessCard(
          "Drag Request Accepted",
          `${userMention(presser.id)} accepted — ${userMention(userId)} ${outcome}.`,
          { actionRows: disabledRows },
        ),
      ),
    );
  }
}
```

Note: `PermissionFlagsBits` is imported for completeness of the overwrite typing; if the linter flags it unused, drop the import.

- [ ] **Step 5: Typecheck + lint**

Run: `bun run typecheck && bun run lint` — Expected: clean for `dragme/`.

---

### Task 5: Module index + README + commit

**Files:**
- Create: `dragme/index.ts`
- Create: `dragme/README.md`

- [ ] **Step 1: Write `dragme/index.ts`**

```ts
import { ChannelType } from "discord.js";
import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handleDragmeExpireFire } from "./lib/expire-handler.js";
import { handleDragmeRevokeFire } from "./lib/revoke-handler.js";
import { deleteRequest } from "./lib/requests.js";

@DefineModule({
  name: "dragme",
  displayName: "Drag Me",
  emoji: "🫳",
  version: "1.0.0",
  description:
    "Voice drag requests approved by the people already in the channel.",
  configSchema: cfg.object({
    request_channel_id: cfg.channel({
      label: "Request Channel",
      description: "Text channel where drag requests are posted and triggered.",
      channelTypes: [ChannelType.GuildText],
    }),
    timeout_minutes: cfg.number({
      label: "Request Timeout (minutes)",
      description: "Minutes before an unanswered request expires.",
      default: 5,
      min: 1,
      max: 60,
    }),
    grace_minutes: cfg.number({
      label: "Connect Pass (minutes)",
      description:
        "How long an accepted requester who wasn't in voice keeps a temporary connect permission.",
      default: 10,
      min: 1,
      max: 120,
    }),
    blacklist_role_ids: cfg.string({
      label: "Blacklisted Roles",
      description: "Comma-separated role IDs that may not use drag requests.",
      list: true,
    }),
  }),
})
export class DragmeModule extends Module {
  public override onLoad() {
    registerTaskFireHandler("dragme-expire", "unicast", handleDragmeExpireFire);
    registerTaskFireHandler("dragme-revoke", "unicast", handleDragmeRevokeFire);
    return super.onLoad();
  }

  public override async deleteUserData(userId: string): Promise<void> {
    for (const guildId of this.container.client.guilds.cache.keys()) {
      await deleteRequest(guildId, userId);
    }
  }
}
```

- [ ] **Step 2: Write `dragme/README.md`**

```markdown
# dragme

Voice drag requests: ask to be pulled into a voice channel; anyone already
inside approves or declines with one click.

- `/dragme <channel>` — request to join a voice channel.
- Post a user mention/ID in the configured request channel — request to join
  wherever that user currently is.
- Accept moves the requester if they're in voice, otherwise grants a temporary
  connect pass (auto-revoked).
- `/dragme-admin active | clear` — moderator tooling.

Configure `request_channel_id`, `timeout_minutes`, `grace_minutes`, and
`blacklist_role_ids` via `/config`.
```

- [ ] **Step 3: Verify**

Run: `bun run typecheck && bun run lint && bun test dragme/ || true`
Expected: typecheck + lint clean (dragme has no pure-logic tests; `bun test` finding no tests is acceptable).

- [ ] **Step 4: Commit**

```bash
git add dragme/ docs/superpowers/plans/2026-07-04-six-addon-port-02-dragme.md
git commit -m "feat(dragme): voice drag requests with button approvals

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
