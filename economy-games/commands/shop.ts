import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { roleMention } from "discord.js";
import { BaseSubcommand, sendReply } from "lumi/commands";
import {
  ephemeralCard,
  makeEmptyCard,
  makeErrorCard,
  makeListCard,
  makeSuccessCard,
} from "lumi/ui";
import {
  formatAmount,
  getCurrency,
  getGamesConfig,
} from "../lib/config.js";
import {
  creditCapped,
  debitBet,
  LedgerInsufficientFunds,
  productionLedger,
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
} from "../lib/store.js";

async function loadItems(
  guildId: string,
): Promise<{ items: ShopItem[]; currency: Awaited<ReturnType<typeof getCurrency>> }> {
  const [config, currency] = await Promise.all([
    getGamesConfig(guildId),
    getCurrency(guildId),
  ]);
  return { items: parseShopItems(config.shopItems), currency };
}

@ApplyOptions<BaseSubcommand.Options>({
  name: "shop",
  description: "Browse the shop, buy items, and manage your inventory.",
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "view", chatInputRun: "chatInputRunView" },
    { name: "buy", chatInputRun: "chatInputRunBuy" },
    { name: "inventory", chatInputRun: "chatInputRunInventory" },
    { name: "use", chatInputRun: "chatInputRunUse" },
    { name: "equip", chatInputRun: "chatInputRunEquip" },
  ],
})
export class ShopCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s.setName("view").setDescription("Browse the shop."),
        )
        .addSubcommand((s) =>
          s
            .setName("buy")
            .setDescription("Buy a shop item.")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Item name.")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s.setName("inventory").setDescription("Show what you own."),
        )
        .addSubcommand((s) =>
          s
            .setName("use")
            .setDescription("Use a consumable item.")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Item name.")
                .setRequired(true),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("equip")
            .setDescription("Equip or unequip a role item.")
            .addStringOption((o) =>
              o
                .setName("name")
                .setDescription("Item name.")
                .setRequired(true),
            ),
        ),
    );
  }

  public async chatInputRunView(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const { items, currency } = await loadItems(guild.id);
    if (items.length === 0)
      return sendReply(
        interaction,
        ephemeralCard(
          makeEmptyCard(
            "Shop",
            "The shop is empty.",
            "An admin can add items in `/lumi` → Modules → Economy Games → Shop Items.",
          ),
        ),
      );
    const sold = await Promise.all(
      items.map((item) => getSold(guild.id, item.name)),
    );
    return sendReply(
      interaction,
      makeListCard(
        "🛒 Shop",
        items.map((item, i) => shopItemLine(item, sold[i]!)),
        { footer: `Prices in ${currency.name} · buy with /shop buy` },
      ),
    );
  }

  public async chatInputRunBuy(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const name = interaction.options.getString("name", true);
    const { items, currency } = await loadItems(guild.id);
    const item = findShopItem(items, name);
    if (!item) return this.itemError(interaction, items, name);
    const sold = await getSold(guild.id, item.name);
    if (item.stock !== null && sold >= item.stock)
      return this.err(interaction, `${item.name} is sold out.`);
    const ledger = productionLedger();
    let after: WalletView;
    try {
      after = await debitBet(
        ledger,
        currency,
        guild.id,
        interaction.user.id,
        item.price,
        "games_shop_buy",
        `shop buy ${item.name}`,
      );
    } catch (err) {
      if (err instanceof LedgerInsufficientFunds)
        return this.err(
          interaction,
          `${item.name} costs ${formatAmount(currency, item.price)} — your wallet is short.`,
        );
      throw err;
    }
    await addSold(guild.id, item.name, 1);
    const inventory = await addInventory(
      guild.id,
      interaction.user.id,
      item.name,
      1,
    );
    let roleNote = "";
    if (item.roleId) {
      const member = await guild.members
        .fetch(interaction.user.id)
        .catch(() => null);
      if (!member) {
        roleNote = "\n-# The role could not be granted (member not found).";
      } else {
        try {
          await member.roles.add(item.roleId);
          roleNote = `\nGranted ${roleMention(item.roleId)}!`;
        } catch {
          roleNote =
            "\n-# The role could not be granted (missing permissions). Run `/shop equip` to retry.";
        }
      }
    }
    return sendReply(
      interaction,
      makeSuccessCard(`🛒 Bought ${item.name}`, [
        `Paid: **${formatAmount(currency, item.price)}**`,
        `You own: **${inventory[item.name.toLowerCase()] ?? 0}**`,
        `Wallet: **${formatAmount(currency, after.wallet)}**${roleNote}`,
      ].join("\n")),
    );
  }

  public async chatInputRunInventory(
    interaction: ChatInputCommandInteraction,
  ) {
    const guild = interaction.guild!;
    const { items, currency } = await loadItems(guild.id);
    const inventory = await getInventory(guild.id, interaction.user.id);
    const owned = Object.entries(inventory);
    if (owned.length === 0)
      return sendReply(
        interaction,
        ephemeralCard(
          makeEmptyCard(
            "Inventory",
            "You own nothing yet.",
            "Browse the stock with `/shop view`.",
          ),
        ),
      );
    const lines = owned.map(([key, count]) => {
      const def = findShopItem(items, key);
      const label = def ? `**${def.name}**` : `**${key}**`;
      const tags: string[] = [];
      if (def?.roleId) tags.push("🎭 role");
      if (def?.consumable) tags.push("🧪 usable");
      return `${label} × **${count}**${tags.length > 0 ? ` · ${tags.join(" · ")}` : ""}`;
    });
    return sendReply(
      interaction,
      ephemeralCard(
        makeListCard("🎒 Inventory", lines, {
          footer: `Wallet prices in ${currency.name}`,
        }),
      ),
    );
  }

  public async chatInputRunUse(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const name = interaction.options.getString("name", true);
    const [config, { items, currency }] = await Promise.all([
      getGamesConfig(guild.id),
      loadItems(guild.id),
    ]);
    const item = findShopItem(items, name);
    if (!item) return this.itemError(interaction, items, name);
    if (!item.consumable)
      return this.err(
        interaction,
        item.roleId
          ? `${item.name} is worn, not used — try \`/shop equip\`.`
          : `${item.name} can't be used.`,
      );
    const inventory = await getInventory(guild.id, interaction.user.id);
    if ((inventory[item.name.toLowerCase()] ?? 0) <= 0)
      return this.err(interaction, `You don't own ${item.name}.`);
    await addInventory(guild.id, interaction.user.id, item.name, -1);
    const low = Math.min(config.useRewardMin, config.useRewardMax);
    const high = Math.max(config.useRewardMin, config.useRewardMax);
    const reward = low + Math.floor(Math.random() * (high - low + 1));
    const { balance, credited } = await creditCapped(
      productionLedger(),
      currency,
      guild.id,
      interaction.user.id,
      reward,
      "games_shop_use",
      `shop use ${item.name} rewarded ${reward}`,
    );
    const cappedNote =
      credited < reward ? " *(capped at the server maximum)*" : "";
    return sendReply(
      interaction,
      ephemeralCard(
        makeSuccessCard(`🧪 Used ${item.name}`, [
          `Found inside: **${formatAmount(currency, credited)}**${cappedNote}`,
          `Wallet: **${formatAmount(currency, balance.wallet)}**`,
        ].join("\n")),
      ),
    );
  }

  public async chatInputRunEquip(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild!;
    const name = interaction.options.getString("name", true);
    const { items } = await loadItems(guild.id);
    const item = findShopItem(items, name);
    if (!item) return this.itemError(interaction, items, name);
    if (!item.roleId)
      return this.err(interaction, `${item.name} grants no role.`);
    const inventory = await getInventory(guild.id, interaction.user.id);
    if ((inventory[item.name.toLowerCase()] ?? 0) <= 0)
      return this.err(
        interaction,
        `You don't own ${item.name}. Buy it with \`/shop buy\` first.`,
      );
    const member = await guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (!member)
      return this.err(interaction, "Could not find you in this server.");
    try {
      if (member.roles.cache.has(item.roleId)) {
        await member.roles.remove(item.roleId);
        return sendReply(
          interaction,
          ephemeralCard(
            makeSuccessCard(
              `Unequipped ${item.name}`,
              `Removed ${roleMention(item.roleId)}.`,
            ),
          ),
        );
      }
      await member.roles.add(item.roleId);
      return sendReply(
        interaction,
        ephemeralCard(
          makeSuccessCard(
            `Equipped ${item.name}`,
            `Granted ${roleMention(item.roleId)}!`,
          ),
        ),
      );
    } catch {
      return this.err(
        interaction,
        "Could not update your roles (the bot may lack permission for that role).",
      );
    }
  }

  private itemError(
    interaction: ChatInputCommandInteraction,
    items: ShopItem[],
    name: string,
  ) {
    const known =
      items.length > 0
        ? ` Available: ${items.map((item) => item.name).join(", ")}.`
        : " The shop is currently empty.";
    return this.err(interaction, `Unknown item "${name}".${known}`);
  }

  private err(interaction: ChatInputCommandInteraction, message: string) {
    return sendReply(
      interaction,
      ephemeralCard(makeErrorCard("Shop", message)),
    );
  }
}
