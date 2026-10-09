import type { InteractionContext } from "lumi/interactions";
import { channels, members, roles } from "lumi/discord";
import { makeInfoCard } from "lumi/ui";
import { getBoosterConfig } from "../lib/config.js";
import {
  addShare,
  deleteRole,
  getRole,
  removeShare,
  setRole,
  type BoosterRole,
} from "../lib/data.js";
import { accessDenial } from "../lib/access.js";
import { colorToHex, parseHexColor, validateRoleName } from "../lib/engine.js";
import { buildPanel, IDS, PREFIX_MODALS } from "../lib/ui.js";

function parseUserId(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);
  return m?.[1] ?? m?.[2] ?? null;
}

export default {
  prefix: PREFIX_MODALS,
  run: async (ctx: InteractionContext) => {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This only works inside a server.");
    const guildId = ctx.guildId;
    switch (ctx.customId) {
      case IDS.nameModalCreate:
        return createRole(ctx, guildId);
      case IDS.nameModalRename:
        return renameRole(ctx, guildId);
      case IDS.colorModal:
        return recolorRole(ctx, guildId);
      case IDS.shareModal:
        return shareRole(ctx, guildId);
      default:
        return undefined;
    }
  },
};

async function createRole(ctx: InteractionContext, guildId: string): Promise<void> {
  const config = await getBoosterConfig(guildId);
  const denial = await accessDenial(guildId, ctx.user.id, config);
  if (denial) return ctx.replyError("Error", denial);

  const check = validateRoleName(ctx.fields["name"] ?? "", config.nameMaxLength);
  if (!check.ok) return ctx.replyError("Error", check.reason!);

  if (await getRole(guildId, ctx.user.id)) return ctx.replyError("Error", "You already have a custom role.");

  const created = await roles
    .create(guildId, { name: check.value!, reason: `Booster custom role for ${ctx.user.id}` })
    .catch(() => null);
  if (!created) {
    return ctx.replyError("Error", "Couldn't create the role. The bot may lack role permissions.");
  }

  const assigned = await members
    .addRole(guildId, ctx.user.id, created.id)
    .then(() => true)
    .catch(() => false);
  if (!assigned) {
    await roles.remove(guildId, created.id, "Owner role assignment failed").catch(() => {});
    return ctx.replyError("Error", "Role created but could not be assigned to you.");
  }

  const boosterRole: BoosterRole = {
    ownerId: ctx.user.id,
    roleId: created.id,
    name: check.value!,
    color: null,
    icon: null,
    sharedWith: [],
  };
  await setRole(guildId, boosterRole);

  if (config.showcaseChannelId) {
    await channels
      .send(
        config.showcaseChannelId,
        makeInfoCard(
          "✨ New Booster Role",
          `<@${ctx.user.id}> just created <@&${boosterRole.roleId}>. Boost the server to make your own!`,
        ),
      )
      .catch(() => {});
  }

  return ctx.reply(buildPanel(boosterRole));
}

async function renameRole(ctx: InteractionContext, guildId: string): Promise<void> {
  const role = await getRole(guildId, ctx.user.id);
  if (!role) return ctx.replyError("Error", "You don't have a custom role.");

  const config = await getBoosterConfig(guildId);
  const check = validateRoleName(ctx.fields["name"] ?? "", config.nameMaxLength);
  if (!check.ok) return ctx.replyError("Error", check.reason!);

  const ok = await roles
    .edit(guildId, role.roleId, { name: check.value!, reason: "Booster role rename" })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    await deleteRole(guildId, ctx.user.id);
    return ctx.replyError("Gone", "That role no longer exists on the server. Create a new one from the panel.");
  }

  role.name = check.value!;
  await setRole(guildId, role);
  return ctx.reply(buildPanel(role));
}

async function recolorRole(ctx: InteractionContext, guildId: string): Promise<void> {
  const role = await getRole(guildId, ctx.user.id);
  if (!role) return ctx.replyError("Error", "You don't have a custom role.");

  const colorInt = parseHexColor(ctx.fields["color"] ?? "");
  if (colorInt === null) {
    return ctx.replyError("Error", "That's not a valid hex colour. Try something like `#5865F2`.");
  }

  const hex = colorToHex(colorInt);
  const ok = await roles
    .edit(guildId, role.roleId, { color: hex, reason: `Booster role recolor to ${hex}` })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    await deleteRole(guildId, ctx.user.id);
    return ctx.replyError("Gone", "That role no longer exists on the server. Create a new one from the panel.");
  }

  role.color = hex;
  await setRole(guildId, role);
  return ctx.reply(buildPanel(role));
}

async function shareRole(ctx: InteractionContext, guildId: string): Promise<void> {
  const config = await getBoosterConfig(guildId);
  const role = await getRole(guildId, ctx.user.id);
  if (!role) return ctx.replyError("Gone", "You no longer have a custom role.");

  const target = parseUserId(ctx.fields["user"]);
  if (!target || target === ctx.user.id) {
    return ctx.replyError("Error", "Mention or paste the ID of another member.");
  }

  const result = await addShare(guildId, ctx.user.id, target, config.maxShares);
  if (!result.ok) return ctx.replyError("Can't Share", result.reason);

  const ok = await members.addRole(guildId, target, role.roleId).then(() => true).catch(() => false);
  if (!ok) {
    await removeShare(guildId, ctx.user.id, target);
    return ctx.replyError("Can't Share", `<@${target}> couldn't be given the role (they may have left the server).`);
  }

  return ctx.replySuccess("Shared", `<@${target}> now has your role.`);
}
