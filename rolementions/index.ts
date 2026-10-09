import { cfg, defineModule, logger } from "lumi";
import { getModuleConfig } from "lumi/config";
import { modules } from "lumi/discord";
import { onEvent } from "lumi/events";
import { registerTaskFireHandler } from "lumi/scheduling";
import { Emojis, makeInfoCard } from "lumi/ui";
import { EXPIRE_TASK, MODULE_NAME } from "./lib/keys.js";
import { getBlocks, getProtectedRoles, incrementMentions } from "./lib/store.js";
import { applyBlock, liftBlock } from "./lib/protection.js";
import { sendLog } from "./lib/log.js";
import { roleMention } from "./lib/format.js";

export const meta = defineModule({
  name: "rolementions",
  displayName: "Role Mentions",
  emoji: "🛡️",
  version: "1.0.0",
  description:
    "Tracks role mentions with daily stats and auto-protects sensitive roles from mention spam via timed mention blocks.",
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description:
        "Channel where mention activity and protection events are logged.",
    }),
    auto_protect: cfg.boolean({
      label: "Auto-Protect",
      description:
        "Automatically block mentions of protected roles when they are pinged.",
      default: true,
    }),
  }),
});

onEvent("messageCreate", async (data) => {
  const guildId = data["guildId"] as string;
  if (data["authorBot"] as boolean) return;

  const roleIds = (data["roleMentionIds"] as string[] | undefined) ?? [];
  if (roleIds.length === 0) return;

  const states = await modules.enabled(guildId, [MODULE_NAME]);
  if (!states[MODULE_NAME]) return;

  const [counts, autoProtect] = await Promise.all([
    incrementMentions(guildId, roleIds),
    getModuleConfig("auto_protect", guildId),
  ]);

  if (autoProtect !== false) {
    const [protectedRoles, blocks] = await Promise.all([
      getProtectedRoles(guildId),
      getBlocks(guildId),
    ]);
    for (const roleId of roleIds) {
      const duration = protectedRoles.get(roleId);
      if (duration === undefined) continue;
      if (blocks.has(roleId)) continue;
      await applyBlock(guildId, roleId, duration, false).catch((err: unknown) => {
        logger.warn(`[rolementions] auto-protect failed in ${guildId}: ${String(err)}`);
      });
    }
  }

  const channelId = data["channelId"] as string;
  const messageId = data["messageId"] as string;
  const authorId = data["authorId"] as string;
  const lines = roleIds.map(
    (roleId) =>
      `${Emojis.Bullet} ${roleMention(roleId)} — **${counts.get(roleId) ?? 0}** today`,
  );
  await sendLog(
    guildId,
    makeInfoCard(
      `${Emojis.Bell} Role Mention${roleIds.length === 1 ? "" : "s"} Detected`,
      [
        `By <@${authorId}> in <#${channelId}> — https://discord.com/channels/${guildId}/${channelId}/${messageId}`,
        lines.join("\n"),
      ],
      { footer: "Counters reset daily at 00:00 UTC." },
    ),
  );
});

registerTaskFireHandler(EXPIRE_TASK, async (payload) => {
  const guildId = payload["guildId"] as string;
  const roleId = payload["roleId"] as string;
  if (typeof guildId !== "string" || typeof roleId !== "string") return;
  await liftBlock(guildId, roleId, "expired");
});
