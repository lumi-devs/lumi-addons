import { cfg, defineModule } from "lumi";
import { onEvent } from "lumi/events";
import { registerTaskFireHandler, schedule } from "lumi/scheduling";
import { guilds, members } from "lumi/discord";
import { getBoosterConfig } from "./lib/config.js";
import { clearGrace, deleteBoosterRole, getGrace, getRole, setGrace } from "./lib/data.js";
import { isEligible } from "./lib/access.js";

export const meta = defineModule({
  name: "booster-roles",
  displayName: "Booster Roles",
  emoji: "🎨",
  version: "1.0.0",
  description:
    "Personal custom roles for server boosters — create, rename, recolor and share a role through an interactive panel, with moderator admin tools, a blacklist, and automatic grace-period cleanup when a boost lapses.",
  short: "Custom roles for boosters.",
  endUserDataStatement:
    "Stores custom booster role links (role ID, owner user ID, and optional shared user IDs) in guild storage for managing server booster perks. Data is deleted upon unlink or GDPR user purge request.",
  configSchema: cfg.object({
    booster_role_ids: cfg.string({
      label: "Qualifying Roles",
      description:
        "Comma-separated role IDs that grant custom-role access. Leave empty to use native server-boost status.",
      list: true,
    }),
    anchor_role_id: cfg.role({
      label: "Anchor Role",
      description:
        "Legacy anchor role; new roles are no longer positioned under it. Kept so existing settings are not lost.",
    }),
    showcase_channel_id: cfg.channel({
      label: "Showcase Channel",
      description: "Optional channel that announces newly created roles.",
    }),
    log_channel_id: cfg.channel({
      label: "Moderation Log",
      description: "Optional channel for deletion / cleanup audit entries.",
    }),
    max_shares: cfg.number({
      label: "Max Shares",
      description: "How many other members an owner may share their role with.",
      default: 3,
      min: 0,
      max: 25,
    }),
    grace_hours: cfg.number({
      label: "Grace Period (hours)",
      description:
        "How long to keep a role after its owner stops boosting before deleting it.",
      default: 24,
      min: 0,
      max: 720,
    }),
    name_max_length: cfg.number({
      label: "Max Name Length",
      description: "Maximum length for custom role names.",
      default: 32,
      min: 2,
      max: 100,
    }),
  }),
});

onEvent("guildMemberUpdate", async (data) => {
  const guildId = data.guildId as string;
  const userId = data.userId as string;

  const role = await getRole(guildId, userId);
  if (!role) return;

  const config = await getBoosterConfig(guildId);
  const member = await guilds.fetchMember(guildId, userId);

  if (member && isEligible(member.roles, member.premiumSince, config)) {
    await clearGrace(guildId, userId);
    if (!member.roles.includes(role.roleId)) {
      await members.addRole(guildId, userId, role.roleId).catch(() => {});
    }
    for (const friendId of role.sharedWith) {
      await members.addRole(guildId, friendId, role.roleId).catch(() => {});
    }
    return;
  }

  if (config.graceHours <= 0) {
    await deleteBoosterRole(guildId, role, config, "their boost lapsed");
    return;
  }

  const existingGrace = await getGrace(guildId, userId);
  if (existingGrace) return;

  const expiresAt = Date.now() + config.graceHours * 3_600_000;
  await setGrace(guildId, userId, expiresAt);
  await schedule(
    "booster-roles:grace-expire",
    { guildId, ownerId: userId, expiresAt },
    { delay: config.graceHours * 3_600_000 },
  );
});

registerTaskFireHandler("booster-roles:grace-expire", async (payload) => {
  const guildId = payload.guildId as string;
  const ownerId = payload.ownerId as string;
  const scheduledExpiresAt = payload.expiresAt as number | undefined;

  const grace = await getGrace(guildId, ownerId);
  if (!grace) return;
  if (scheduledExpiresAt && grace.expiresAt > scheduledExpiresAt) return;

  const role = await getRole(guildId, ownerId);
  if (!role) {
    await clearGrace(guildId, ownerId);
    return;
  }

  const config = await getBoosterConfig(guildId);
  const member = await guilds.fetchMember(guildId, ownerId);
  if (member && isEligible(member.roles, member.premiumSince, config)) {
    await clearGrace(guildId, ownerId);
    return;
  }

  await deleteBoosterRole(guildId, role, config, "boost lapsed grace period expired");
});
