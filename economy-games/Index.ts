import { defineModule } from "@lumi-devs/lumi/module";
import { cfg } from "@lumi-devs/lumi/config";
import type { Container } from "@lumi-devs/lumi/services";

export const economyGamesModule = defineModule({
  name: "economy-games",
  displayName: "Economy Games",
  emoji: "🎰",
  version: "1.0.0",
  description:
    "Blackjack, roulette, crime with jail, work/beg/fish/mine grinds, and a role-granting shop settled through the guild bank.",
  short: "Casino games, crime, grinds, and a shop backed by the bank.",
  endUserDataStatement:
    "Stores jail sentences, shop inventories, and active game tables keyed by user ID in this addon's own storage namespace. Wallet balances live in the guild bank. All addon rows are removed on GDPR erasure.",
  author: ["Lumi Developers"],
  min_bot_version: "0.6.0",
  category: "Community",
  configSchema: cfg.object({
    blackjack_min_bet: cfg.number({
      label: "Blackjack Minimum Bet",
      description: "Smallest allowed blackjack bet.",
      default: 5,
      min: 1,
      group: "Blackjack",
    }),
    blackjack_max_bet: cfg.number({
      label: "Blackjack Maximum Bet",
      description: "Largest allowed blackjack bet.",
      default: 500,
      min: 1,
      group: "Blackjack",
    }),
    blackjack_payout: cfg.number({
      label: "Blackjack Payout",
      description: "Profit multiplier paid on a natural blackjack.",
      default: 1.5,
      min: 1,
      max: 5,
      step: 0.5,
      group: "Blackjack",
    }),
    roulette_min_bet: cfg.number({
      label: "Roulette Minimum Bet",
      description: "Smallest allowed roulette bet.",
      default: 5,
      min: 1,
      group: "Roulette",
    }),
    roulette_max_bet: cfg.number({
      label: "Roulette Maximum Bet",
      description: "Largest allowed roulette bet.",
      default: 500,
      min: 1,
      group: "Roulette",
    }),
    crime_cooldown: cfg.duration({
      label: "Crime Cooldown",
      description: "How long a member waits between crimes.",
      default: "10m",
      quickPicks: ["1m", "5m", "10m", "30m", "1h"],
      group: "Crime",
    }),
    work_cooldown: cfg.duration({
      label: "Work Cooldown",
      description: "How long a member waits between shifts.",
      default: "30m",
      quickPicks: ["5m", "30m", "1h", "24h"],
      group: "Grinds",
    }),
    beg_cooldown: cfg.duration({
      label: "Beg Cooldown",
      description: "How long a member waits between begging.",
      default: "2m",
      quickPicks: ["1m", "2m", "5m", "15m"],
      group: "Grinds",
    }),
    fish_cooldown: cfg.duration({
      label: "Fish Cooldown",
      description: "How long a member waits between fishing trips.",
      default: "10m",
      quickPicks: ["1m", "10m", "30m", "1h"],
      group: "Grinds",
    }),
    mine_cooldown: cfg.duration({
      label: "Mine Cooldown",
      description: "How long a member waits between mining shifts.",
      default: "10m",
      quickPicks: ["1m", "10m", "30m", "1h"],
      group: "Grinds",
    }),
    use_reward_min: cfg.number({
      label: "Consumable Minimum Reward",
      description: "Smallest payout from using a consumable shop item.",
      default: 20,
      min: 0,
      group: "Shop",
    }),
    use_reward_max: cfg.number({
      label: "Consumable Maximum Reward",
      description: "Largest payout from using a consumable shop item.",
      default: 120,
      min: 0,
      group: "Shop",
    }),
    shop_items: cfg.stringList({
      label: "Shop Items",
      description:
        "One item per line as name | price | description | roleId | consumable | stock. roleId, consumable (yes/no), and stock are optional; empty stock means unlimited.",
      default: [],
      group: "Shop",
    }),
  }),

  async deleteUserData(services: Container, userId: string): Promise<void> {
    await services.db.guildKV.deleteModuleDataForTarget("economy-games", userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await services.db.guildKV.listModuleDataForTarget("economy-games", userId);
    if (rows.length === 0) return null;
    return { records: rows.map((r) => ({ guildId: r.guildId, key: r.key, value: r.value })) };
  },
});
