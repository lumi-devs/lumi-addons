import { Module, DefineModule, cfg } from "lumi";
import { GamesKeys } from "./keys.js";
import { deleteUserState, exportUserState } from "./lib/store.js";

const COOLDOWN_SCOPES = [
  "grind-work",
  "grind-beg",
  "grind-fish",
  "grind-mine",
  "crime",
];

@DefineModule({
  name: "economy-games",
  displayName: "Economy Games",
  emoji: "🎰",
  version: "1.0.0",
  description:
    "Blackjack, roulette, crime with jail, work/beg/fish/mine grinds, and a role-granting shop — every payout settled through the core Economy ledger.",
  configSchema: cfg.object({
    blackjackMinBet: cfg.number({
      label: "Blackjack Minimum Bet",
      description: "Smallest allowed blackjack bet.",
      default: 5,
      min: 1,
      group: "Blackjack",
    }),
    blackjackMaxBet: cfg.number({
      label: "Blackjack Maximum Bet",
      description: "Largest allowed blackjack bet.",
      default: 500,
      min: 1,
      group: "Blackjack",
    }),
    blackjackPayout: cfg.number({
      label: "Blackjack Payout",
      description: "Profit multiplier paid on a natural blackjack.",
      default: 1.5,
      min: 1,
      max: 5,
      step: 0.5,
      group: "Blackjack",
    }),
    rouletteMinBet: cfg.number({
      label: "Roulette Minimum Bet",
      description: "Smallest allowed roulette bet.",
      default: 5,
      min: 1,
      group: "Roulette",
    }),
    rouletteMaxBet: cfg.number({
      label: "Roulette Maximum Bet",
      description: "Largest allowed roulette bet.",
      default: 500,
      min: 1,
      group: "Roulette",
    }),
    crimeCooldown: cfg.duration({
      label: "Crime Cooldown",
      description: "How long a member waits between crimes.",
      default: "10m",
      quickPicks: ["1m", "5m", "10m", "30m", "1h"],
      group: "Crime",
    }),
    workCooldown: cfg.duration({
      label: "Work Cooldown",
      description: "How long a member waits between shifts.",
      default: "30m",
      quickPicks: ["5m", "30m", "1h", "24h"],
      group: "Grinds",
    }),
    begCooldown: cfg.duration({
      label: "Beg Cooldown",
      description: "How long a member waits between begging.",
      default: "2m",
      quickPicks: ["1m", "2m", "5m", "15m"],
      group: "Grinds",
    }),
    fishCooldown: cfg.duration({
      label: "Fish Cooldown",
      description: "How long a member waits between fishing trips.",
      default: "10m",
      quickPicks: ["1m", "10m", "30m", "1h"],
      group: "Grinds",
    }),
    mineCooldown: cfg.duration({
      label: "Mine Cooldown",
      description: "How long a member waits between mining shifts.",
      default: "10m",
      quickPicks: ["1m", "10m", "30m", "1h"],
      group: "Grinds",
    }),
    useRewardMin: cfg.number({
      label: "Consumable Minimum Reward",
      description: "Smallest payout from using a consumable shop item.",
      default: 20,
      min: 0,
      group: "Shop",
    }),
    useRewardMax: cfg.number({
      label: "Consumable Maximum Reward",
      description: "Largest payout from using a consumable shop item.",
      default: 120,
      min: 0,
      group: "Shop",
    }),
    shopItems: cfg.stringList({
      label: "Shop Items",
      description:
        "One item per line as name | price | description | roleId | consumable | stock. roleId, consumable (yes/no), and stock are optional; empty stock means unlimited.",
      default: [],
      group: "Shop",
    }),
  }),
})
export class EconomyGamesModule extends Module {
  public override async deleteUserData(userId: string): Promise<void> {
    for (const guildId of this.container.client.guilds.cache.keys()) {
      await deleteUserState(
        guildId,
        userId,
        COOLDOWN_SCOPES.map((scope) =>
          GamesKeys.cooldown(scope, guildId, userId),
        ),
        [
          GamesKeys.blackjack(guildId, userId),
          GamesKeys.roulette(guildId, userId),
        ],
      );
    }
  }

  public override async exportUserData(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const perGuild: Record<string, unknown> = {};
    for (const guildId of this.container.client.guilds.cache.keys()) {
      const data = await exportUserState(guildId, userId);
      if (data) perGuild[guildId] = data;
    }
    return Object.keys(perGuild).length > 0 ? perGuild : null;
  }
}
