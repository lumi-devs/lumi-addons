import { defineCommand, type CommandContext } from "lumi/commands";
import { guilds, members } from "lumi/discord";
import {
  makeEmptyCard,
  makeErrorCard,
  makeListCard,
  makeSuccessCard,
} from "lumi/ui";
import {
  formatAmount,
  getCurrency,
  getGamesConfig,
  type CurrencyConfig,
} from "../lib/config.js";
import {
  creditCapped,
  debitBet,
  LedgerInsufficientFunds,
  type WalletView,
} from "../lib/ledger.js";
import {
  findShopItem,
  parseShopItems,
  shopItemLine,
  type ShopItem,
} from "../lib/shop.js";
import {
  addInventory,
  addSold,
  getInventory,
  getSold,
  productionLedger,
} from "../lib/store.js";

async function loadItems(
  guildId: string,
): Promise<{ items: ShopItem[]; currency: CurrencyConfig }> {
  const [config, currency] = await Promise.all([
    getGamesConfig(guildId),
    getCurrency(guildId),
  ]);
  return { items: parseShopItems(config.shopItems), currency };
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
  const { items, currency } = await loadItems(guildId);
  if (items.length === 0) {
    await ctx.reply(
      makeEmptyCard(
        "Shop",
        "The shop is empty.",
        "An admin can add items in `/lumi` → Modules → Economy Games → Shop Items.",
      ),
    );
    return;
  }
  const sold = await Promise.all(
    items.map((item) => getSold(guildId, item.name)),
  );
  await ctx.reply(
    makeListCard(
      "🛒 Shop",
      items.map((item, i) => shopItemLine(item, sold[i]!)),
      { footer: `Prices in ${currency.name} · buy with /shop buy` },
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
  const { items, currency } = await loadItems(guildId);
  const item = findShopItem(items, name);
  if (!item) {
    await itemError(ctx, items, name);
    return;
  }
  const sold = await getSold(guildId, item.name);
  if (item.stock !== null && sold >= item.stock) {
    await shopError(ctx, `${item.name} is sold out.`);
    return;
  }
  const ledger = productionLedger();
  let after: WalletView;
  try {
    after = await debitBet(
      ledger,
      currency,
      guildId,
      ctx.user.id,
      item.price,
      "games_shop_buy",
      `shop buy ${item.name}`,
    );
  } catch (err) {
    if (err instanceof LedgerInsufficientFunds) {
      await shopError(
        ctx,
        `${item.name} costs ${formatAmount(currency, item.price)} — your wallet is short.`,
      );
      return;
    }
    throw err;
  }
  await addSold(guildId, item.name, 1);
  const inventory = await addInventory(guildId, ctx.user.id, item.name, 1);
  let roleNote = "";
  if (item.roleId) {
    const member = await guilds.fetchMember(guildId, ctx.user.id);
    if (!member) {
      roleNote = "\n-# The role could not be granted (member not found).";
    } else {
      try {
        await members.addRole(guildId, ctx.user.id, item.roleId);
        roleNote = `\nGranted <@&${item.roleId}>!`;
      } catch {
        roleNote =
          "\n-# The role could not be granted (missing permissions). Run `/shop equip` to retry.";
      }
    }
  }
  await ctx.reply(
    makeSuccessCard(`🛒 Bought ${item.name}`, [
      `Paid: **${formatAmount(currency, item.price)}**`,
      `You own: **${inventory[item.name.toLowerCase()] ?? 0}**`,
      `Wallet: **${formatAmount(currency, after.wallet)}**${roleNote}`,
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
  const { items, currency } = await loadItems(guildId);
  const inventory = await getInventory(guildId, ctx.user.id);
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
    if (def?.roleId) tags.push("🎭 role");
    if (def?.consumable) tags.push("🧪 usable");
    return `${label} × **${count}**${tags.length > 0 ? ` · ${tags.join(" · ")}` : ""}`;
  });
  await ctx.reply(
    makeListCard("🎒 Inventory", lines, {
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
    getGamesConfig(guildId),
    loadItems(guildId),
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
        ? `${item.name} is worn, not used — try \`/shop equip\`.`
        : `${item.name} can't be used.`,
    );
    return;
  }
  const inventory = await getInventory(guildId, ctx.user.id);
  if ((inventory[item.name.toLowerCase()] ?? 0) <= 0) {
    await shopError(ctx, `You don't own ${item.name}.`);
    return;
  }
  await addInventory(guildId, ctx.user.id, item.name, -1);
  const low = Math.min(config.useRewardMin, config.useRewardMax);
  const high = Math.max(config.useRewardMin, config.useRewardMax);
  const reward = low + Math.floor(Math.random() * (high - low + 1));
  const { balance, credited } = await creditCapped(
    productionLedger(),
    currency,
    guildId,
    ctx.user.id,
    reward,
    "games_shop_use",
    `shop use ${item.name} rewarded ${reward}`,
  );
  const cappedNote =
    credited < reward ? " *(capped at the server maximum)*" : "";
  await ctx.reply(
    makeSuccessCard(`🧪 Used ${item.name}`, [
      `Found inside: **${formatAmount(currency, credited)}**${cappedNote}`,
      `Wallet: **${formatAmount(currency, balance.wallet)}**`,
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
  const { items } = await loadItems(guildId);
  const item = findShopItem(items, name);
  if (!item) {
    await itemError(ctx, items, name);
    return;
  }
  if (!item.roleId) {
    await shopError(ctx, `${item.name} grants no role.`);
    return;
  }
  const inventory = await getInventory(guildId, ctx.user.id);
  if ((inventory[item.name.toLowerCase()] ?? 0) <= 0) {
    await shopError(
      ctx,
      `You don't own ${item.name}. Buy it with \`/shop buy\` first.`,
    );
    return;
  }
  const member = await guilds.fetchMember(guildId, ctx.user.id);
  if (!member) {
    await shopError(ctx, "Could not find you in this server.");
    return;
  }
  try {
    if (member.roles.includes(item.roleId)) {
      await members.removeRole(guildId, ctx.user.id, item.roleId);
      await ctx.reply(
        makeSuccessCard(
          `Unequipped ${item.name}`,
          `Removed <@&${item.roleId}>.`,
        ),
      );
      return;
    }
    await members.addRole(guildId, ctx.user.id, item.roleId);
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

const nameOption = (description: string) => ({
  type: 3,
  name: "name",
  description,
  required: true,
});

export default defineCommand({
  name: "shop",
  description: "Browse the shop, buy items, and manage your inventory.",
  build: () => ({
    name: "shop",
    description: "Browse the shop, buy items, and manage your inventory.",
    options: [
      { type: 1, name: "view", description: "Browse the shop." },
      {
        type: 1,
        name: "buy",
        description: "Buy a shop item.",
        options: [nameOption("Item name.")],
      },
      { type: 1, name: "inventory", description: "Show what you own." },
      {
        type: 1,
        name: "use",
        description: "Use a consumable item.",
        options: [nameOption("Item name.")],
      },
      {
        type: 1,
        name: "equip",
        description: "Equip or unequip a role item.",
        options: [nameOption("Item name.")],
      },
    ],
  }),
  run: async (ctx: CommandContext) => {
    await runView(ctx);
  },
  handlers: {
    view: runView,
    buy: runBuy,
    inventory: runInventory,
    use: runUse,
    equip: runEquip,
  },
});
