import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import {
  makeEmptyCard,
  makeErrorCard,
  makeListCard,
  makeSuccessCard,
} from "@lumi-devs/lumi/ui";
import { currencyName } from "@lumi-devs/lumi/bank";
import { MODULE_NAME } from "../utilities/Keys.js";
import {
  formatAmount,
  getGamesConfig,
  type CurrencyView,
} from "../utilities/Config.js";
import {
  creditWinnings,
  debitBet,
  LedgerInsufficientFunds,
} from "../utilities/Ledger.js";
import {
  findShopItem,
  parseShopItems,
  shopItemLine,
  type ShopItem,
} from "../utilities/Shop.js";
import {
  addInventory,
  addSold,
  getInventory,
  getSold,
} from "../utilities/Store.js";

async function loadItems(
  ctx: CommandContext,
  guildId: string,
): Promise<{ items: ShopItem[]; currency: CurrencyView }> {
  const [config, name] = await Promise.all([
    getGamesConfig(ctx.services, guildId),
    currencyName(ctx.services, guildId),
  ]);
  return { items: parseShopItems(config.shopItems), currency: { name, emoji: "🪙" } };
}

async function itemError(
  ctx: CommandContext,
  items: ShopItem[],
  name: string,
): Promise<void> {
  const known =
    items.length > 0
      ? ` Available: ${items.map((item) => item.name).join(", ")}.`
      : " The shop is currently empty.";
  await ctx.reply(makeErrorCard("Shop", `Unknown item "${name}".${known}`));
}

async function shopError(ctx: CommandContext, message: string): Promise<void> {
  await ctx.reply(makeErrorCard("Shop", message));
}

async function runView(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const { items, currency } = await loadItems(ctx, guildId);
  if (items.length === 0) {
    await ctx.reply(
      makeEmptyCard(
        "Shop",
        "The shop is empty.",
        "An admin can add items in the dashboard under Modules, Economy Games, Shop Items.",
      ),
    );
    return;
  }
  const sold = await Promise.all(
    items.map((item) => getSold(ctx.services, guildId, item.name)),
  );
  await ctx.reply(
    makeListCard(
      "Shop",
      items.map((item, i) => shopItemLine(item, sold[i]!)),
      { footer: `Prices in ${currency.name}, buy with /shop buy` },
    ),
    { ephemeral: false },
  );
}

async function runBuy(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const name = await ctx.getString("name", { required: true });
  if (name === null) {
    await shopError(ctx, "Tell me which item to buy.");
    return;
  }
  const { items, currency } = await loadItems(ctx, guildId);
  const item = findShopItem(items, name);
  if (!item) {
    await itemError(ctx, items, name);
    return;
  }
  const sold = await getSold(ctx.services, guildId, item.name);
  if (item.stock !== null && sold >= item.stock) {
    await shopError(ctx, `${item.name} is sold out.`);
    return;
  }
  let wallet: number;
  try {
    wallet = await debitBet(ctx.services, guildId, ctx.user.id, item.price);
  } catch (err) {
    if (err instanceof LedgerInsufficientFunds) {
      await shopError(
        ctx,
        `${item.name} costs ${formatAmount(currency, item.price)}, your wallet is short.`,
      );
      return;
    }
    throw err;
  }
  await addSold(ctx.services, guildId, item.name, 1);
  const inventory = await addInventory(ctx.services, guildId, ctx.user.id, item.name, 1);
  let roleNote = "";
  if (item.roleId && ctx.guild) {
    const member = await ctx.guild.members.fetch(ctx.user.id).catch(() => null);
    if (!member) {
      roleNote = "\n-# The role could not be granted (member not found).";
    } else {
      try {
        await member.roles.add(item.roleId, "Shop purchase");
        roleNote = `\nGranted <@&${item.roleId}>!`;
      } catch {
        roleNote =
          "\n-# The role could not be granted (missing permissions). Run `/shop equip` to retry.";
      }
    }
  }
  await ctx.reply(
    makeSuccessCard(`Bought ${item.name}`, [
      `Paid: **${formatAmount(currency, item.price)}**`,
      `You own: **${inventory[item.name.toLowerCase()] ?? 0}**`,
      `Wallet: **${formatAmount(currency, wallet)}**${roleNote}`,
    ].join("\n")),
    { ephemeral: false },
  );
}

async function runInventory(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const { items, currency } = await loadItems(ctx, guildId);
  const inventory = await getInventory(ctx.services, guildId, ctx.user.id);
  const owned = Object.entries(inventory);
  if (owned.length === 0) {
    await ctx.reply(
      makeEmptyCard(
        "Inventory",
        "You own nothing yet.",
        "Browse the stock with `/shop view`.",
      ),
    );
    return;
  }
  const lines = owned.map(([key, count]) => {
    const def = findShopItem(items, key);
    const label = def ? `**${def.name}**` : `**${key}**`;
    const tags: string[] = [];
    if (def?.roleId) tags.push("role");
    if (def?.consumable) tags.push("usable");
    return `${label} x **${count}**${tags.length > 0 ? ` - ${tags.join(" - ")}` : ""}`;
  });
  await ctx.reply(
    makeListCard("Inventory", lines, {
      footer: `Wallet prices in ${currency.name}`,
    }),
  );
}

async function runUse(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const name = await ctx.getString("name", { required: true });
  if (name === null) {
    await shopError(ctx, "Tell me which item to use.");
    return;
  }
  const [config, { items, currency }] = await Promise.all([
    getGamesConfig(ctx.services, guildId),
    loadItems(ctx, guildId),
  ]);
  const item = findShopItem(items, name);
  if (!item) {
    await itemError(ctx, items, name);
    return;
  }
  if (!item.consumable) {
    await shopError(
      ctx,
      item.roleId
        ? `${item.name} is worn, not used, try \`/shop equip\`.`
        : `${item.name} can't be used.`,
    );
    return;
  }
  const inventory = await getInventory(ctx.services, guildId, ctx.user.id);
  if ((inventory[item.name.toLowerCase()] ?? 0) <= 0) {
    await shopError(ctx, `You don't own ${item.name}.`);
    return;
  }
  await addInventory(ctx.services, guildId, ctx.user.id, item.name, -1);
  const low = Math.min(config.useRewardMin, config.useRewardMax);
  const high = Math.max(config.useRewardMin, config.useRewardMax);
  const reward = low + Math.floor(Math.random() * (high - low + 1));
  const result = await creditWinnings(ctx.services, guildId, ctx.user.id, reward);
  await ctx.reply(
    makeSuccessCard(`Used ${item.name}`, [
      `Found inside: **${formatAmount(currency, result.credited)}**`,
      `Wallet: **${formatAmount(currency, result.wallet)}**`,
    ].join("\n")),
  );
}

async function runEquip(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) {
    await ctx.replyError("Guild Only", "This command only works inside a server.");
    return;
  }
  const name = await ctx.getString("name", { required: true });
  if (name === null) {
    await shopError(ctx, "Tell me which item to equip.");
    return;
  }
  const { items } = await loadItems(ctx, guildId);
  const item = findShopItem(items, name);
  if (!item) {
    await itemError(ctx, items, name);
    return;
  }
  if (!item.roleId) {
    await shopError(ctx, `${item.name} grants no role.`);
    return;
  }
  const inventory = await getInventory(ctx.services, guildId, ctx.user.id);
  if ((inventory[item.name.toLowerCase()] ?? 0) <= 0) {
    await shopError(
      ctx,
      `You don't own ${item.name}. Buy it with \`/shop buy\` first.`,
    );
    return;
  }
  if (!ctx.guild) {
    await shopError(ctx, "Could not find you in this server.");
    return;
  }
  const member = await ctx.guild.members.fetch(ctx.user.id).catch(() => null);
  if (!member) {
    await shopError(ctx, "Could not find you in this server.");
    return;
  }
  try {
    if (member.roles.cache.has(item.roleId)) {
      await member.roles.remove(item.roleId, "Shop unequip");
      await ctx.reply(
        makeSuccessCard(
          `Unequipped ${item.name}`,
          `Removed <@&${item.roleId}>.`,
        ),
      );
      return;
    }
    await member.roles.add(item.roleId, "Shop equip");
    await ctx.reply(
      makeSuccessCard(
        `Equipped ${item.name}`,
        `Granted <@&${item.roleId}>!`,
      ),
    );
  } catch {
    await shopError(
      ctx,
      "Could not update your roles (the bot may lack permission for that role).",
    );
  }
}

export const shopDef: CommandDef = {
  name: "shop",
  module: MODULE_NAME,
  description: "Browse the shop, buy items, and manage your inventory.",
  guildOnly: true,
  requiredClientPermissions: [PermissionFlagsBits.ManageRoles],
  prefixEnabled: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("shop")
      .setDescription("Browse the shop, buy items, and manage your inventory.")
      .addSubcommand((sub) =>
        sub.setName("view").setDescription("Browse the shop."),
      )
      .addSubcommand((sub) =>
        sub
          .setName("buy")
          .setDescription("Buy a shop item.")
          .addStringOption((opt) =>
            opt.setName("name").setDescription("Item name.").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("inventory").setDescription("Show what you own."),
      )
      .addSubcommand((sub) =>
        sub
          .setName("use")
          .setDescription("Use a consumable item.")
          .addStringOption((opt) =>
            opt.setName("name").setDescription("Item name.").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("equip")
          .setDescription("Equip or unequip a role item.")
          .addStringOption((opt) =>
            opt.setName("name").setDescription("Item name.").setRequired(true),
          ),
      ) as SlashCommandBuilder,
  run: runView,
  handlers: {
    view: runView,
    buy: runBuy,
    inventory: runInventory,
    use: runUse,
    equip: runEquip,
  },
  defaultSub: "view",
};
