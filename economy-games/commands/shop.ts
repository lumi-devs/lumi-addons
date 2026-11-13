import type { CommandDefinition } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeEmptyCard,
  makeErrorCard,
  makeSuccessCard,
} from "@lumi/ui";
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { ShopItem } from "../data.js";
import {
  LockTtlMs,
  addInventory,
  consumeInventory,
  findShopItem,
  findShopItemByKey,
  formatMoney,
  getConfig,
  getSold,
  grantRole,
  listInventory,
  parseShopItems,
  releaseStock,
  requireGuildId,
  reserveStock,
  roleGrantNote,
  roleToggleNote,
  rollConsumableReward,
  toggleRole,
  userLockKey,
  withLock,
} from "../data.js";
import { inventoryCard, shopViewCard } from "../ui.js";

const ShopPageSize = 10;

function unknownItemMessage(
  items: readonly ShopItem[],
  name: string,
): string {
  if (items.length === 0) return "The shop is empty.";
  const available = items.map((item) => item.name).join(", ");
  return `Unknown item "${name}". Available: ${available}.`;
}

export const shopCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("gameshop")
    .setDescription("Browse, buy, and use server shop items")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("view")
        .setDescription("Browse the shop")
        .addIntegerOption((option) =>
          option
            .setName("page")
            .setDescription("Page number")
            .setMinValue(1)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("buy")
        .setDescription("Buy a shop item")
        .addStringOption((option) =>
          option
            .setName("item")
            .setDescription("Item name")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("inventory")
        .setDescription("View your inventory")
        .addIntegerOption((option) =>
          option
            .setName("page")
            .setDescription("Page number")
            .setMinValue(1)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("use")
        .setDescription("Use a consumable or role item")
        .addStringOption((option) =>
          option
            .setName("item")
            .setDescription("Item name")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("equip")
        .setDescription("Equip or unequip a role item")
        .addStringOption((option) =>
          option
            .setName("item")
            .setDescription("Item name")
            .setRequired(true),
        ),
    ),
  guildOnly: true,
  async execute(interaction, services) {
    const guildId = await requireGuildId(interaction, services);
    if (!guildId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const config = await getConfig(services, guildId);
    const items = parseShopItems(config.shopItems);
    const subcommand = interaction.options.getSubcommand(true);
    const userId = interaction.user.id;

    if (subcommand === "view") {
      if (items.length === 0) {
        await interaction.editReply(
          ephemeralCard(
            makeEmptyCard(
              "Shop",
              "The shop is empty.",
              "An administrator can add items in the module configuration.",
            ),
          ),
        );
        return;
      }
      const totalPages = Math.max(1, Math.ceil(items.length / ShopPageSize));
      const requested = interaction.options.getInteger("page") ?? 1;
      const page = Math.min(Math.max(1, requested), totalPages);
      const pageItems = items.slice(
        (page - 1) * ShopPageSize,
        page * ShopPageSize,
      );
      const sold = await Promise.all(
        pageItems.map((item) => getSold(services, guildId, item.name)),
      );
      await interaction.editReply(
        shopViewCard(pageItems, sold, page, totalPages, items.length),
      );
      return;
    }

    if (subcommand === "buy") {
      const name = interaction.options.getString("item", true);
      const item = findShopItem(items, name);
      if (!item) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard("Unknown Item", unknownItemMessage(items, name)),
          ),
        );
        return;
      }

      const reserved = await reserveStock(
        services,
        guildId,
        item.name,
        item.stock,
      );
      if (!reserved) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard("Sold Out", `**${item.name}** is sold out.`),
          ),
        );
        return;
      }

      const price = BigInt(item.price);
      let paid: boolean;
      try {
        paid = await services.helpers.economy.debit(
          guildId,
          userId,
          price,
          {
            ledger: { type: "shop_purchase", description: item.name },
          },
        );
      } catch (error) {
        await releaseStock(services, guildId, item.name, item.stock);
        throw error;
      }
      if (!paid) {
        await releaseStock(services, guildId, item.name, item.stock);
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "Insufficient Funds",
              `**${item.name}** costs ${formatMoney(price)}.`,
            ),
          ),
        );
        return;
      }

      let count: number;
      try {
        count = await addInventory(
          services,
          guildId,
          userId,
          item.name,
          1,
        );
      } catch (error) {
        await releaseStock(services, guildId, item.name, item.stock);
        await services.helpers.economy
          .refund(guildId, userId, price, {
            type: "shop_refund",
            description: "Failed shop purchase refund",
          })
          .catch(() => undefined);
        throw error;
      }

      const lines = [
        `Purchased **${item.name}** for ${formatMoney(price)}.`,
        `You own **${count}**.`,
      ];
      if (item.stock !== null) {
        const sold = await getSold(services, guildId, item.name);
        lines.push(`Stock left — **${Math.max(0, item.stock - sold)}**.`);
      }
      if (item.roleId) {
        const guild = interaction.guild;
        lines.push(
          guild
            ? roleGrantNote(await grantRole(guild, userId, item.roleId))
            : "Role not granted: the server is unavailable.",
        );
      }
      await interaction.editReply(
        makeSuccessCard(`Bought ${item.name}`, lines),
      );
      return;
    }

    if (subcommand === "inventory") {
      const entries = await listInventory(services, guildId, userId);
      if (entries.length === 0) {
        await interaction.editReply(
          ephemeralCard(
            makeEmptyCard(
              "Inventory",
              "Your inventory is empty.",
              "Buy something with `/gameshop buy`.",
            ),
          ),
        );
        return;
      }
      const totalPages = Math.max(1, Math.ceil(entries.length / ShopPageSize));
      const requested = interaction.options.getInteger("page") ?? 1;
      const page = Math.min(Math.max(1, requested), totalPages);
      const pageEntries = entries.slice(
        (page - 1) * ShopPageSize,
        page * ShopPageSize,
      );
      await interaction.editReply(
        inventoryCard(
          pageEntries.map((entry) => {
            const item = findShopItemByKey(items, entry.key);
            return {
              name: item?.name ?? entry.key,
              count: entry.count,
              description: item?.description ?? "",
            };
          }),
          page,
          totalPages,
          entries.length,
        ),
      );
      return;
    }

    if (subcommand === "use") {
      const name = interaction.options.getString("item", true);
      const item = findShopItem(items, name);
      if (!item) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard("Unknown Item", unknownItemMessage(items, name)),
          ),
        );
        return;
      }
      if (!item.consumable && !item.roleId) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "Not Usable",
              `**${item.name}** is a collectible and cannot be used.`,
            ),
          ),
        );
        return;
      }

      const used = await withLock(
        services,
        userLockKey(`shop-use:${item.key}`, guildId, userId),
        LockTtlMs,
        async () => {
          const remaining = await consumeInventory(
            services,
            guildId,
            userId,
            item.name,
          );
          if (remaining < 0) return { kind: "none" as const };
          let reward = 0n;
          if (item.consumable) {
            reward = rollConsumableReward(config);
            if (reward > 0n) {
              try {
                await services.helpers.economy.credit(
                  guildId,
                  userId,
                  reward,
                  {
                    ledger: {
                      type: "shop_use_reward",
                      description: item.name,
                    },
                  },
                );
              } catch (error) {
                await addInventory(
                  services,
                  guildId,
                  userId,
                  item.name,
                  1,
                ).catch(() => undefined);
                throw error;
              }
            }
          }
          return { kind: "used" as const, remaining, reward };
        },
      );

      if (!used) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard("Shop", "That item is already being used."),
          ),
        );
        return;
      }
      if (used.kind === "none") {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "Not Owned",
              `You do not own **${item.name}**.`,
            ),
          ),
        );
        return;
      }

      const lines = [
        `Used **${item.name}**.`,
        `Remaining — **${used.remaining}**.`,
      ];
      if (used.reward > 0n) {
        lines.push(`Reward — ${formatMoney(used.reward)}.`);
      }
      if (item.roleId) {
        const guild = interaction.guild;
        lines.push(
          guild
            ? roleGrantNote(await grantRole(guild, userId, item.roleId))
            : "Role not granted: the server is unavailable.",
        );
      }
      await interaction.editReply(
        makeSuccessCard(`Used ${item.name}`, lines),
      );
      return;
    }

    if (subcommand === "equip") {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard("Server Only", "Role items only work in a server."),
          ),
        );
        return;
      }
      const name = interaction.options.getString("item", true);
      const item = findShopItem(items, name);
      if (!item) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard("Unknown Item", unknownItemMessage(items, name)),
          ),
        );
        return;
      }
      if (!item.roleId) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "No Role",
              `**${item.name}** does not grant a role.`,
            ),
          ),
        );
        return;
      }
      const inventory = await listInventory(services, guildId, userId);
      const owned = inventory.find((entry) => entry.key === item.key);
      if (!owned || owned.count <= 0) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "Not Owned",
              `You do not own **${item.name}**. Buy it with \`/gameshop buy\` first.`,
            ),
          ),
        );
        return;
      }
      const result = await toggleRole(guild, userId, item.roleId);
      if (!result.toggled) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard("Role Update Failed", roleToggleNote(result)),
          ),
        );
        return;
      }
      await interaction.editReply(
        ephemeralCard(
          makeSuccessCard(
            result.equipped ? `Equipped ${item.name}` : `Unequipped ${item.name}`,
            result.equipped
              ? `<@&${item.roleId}> was granted.`
              : `<@&${item.roleId}> was removed.`,
          ),
        ),
      );
      return;
    }

    await interaction.editReply(
      ephemeralCard(makeErrorCard("Shop", "Unknown subcommand.")),
    );
  },
};