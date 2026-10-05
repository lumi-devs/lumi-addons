export const MODULE_NAME = "economy-games";

export const ECONOMY_MODULE_NAME = "economy";

export const JAIL_KEY = "jail";

export const INVENTORY_KEY = "inventory";

export const SHOP_SCOPE = "shop";

export const stockKey = (name: string): string =>
  `stock:${name.toLowerCase()}`;

export interface JailRecord {
  until: number;
  reason: string;
}

export const GamesKeys = {
  cooldown: (scope: string, guildId: string, userId: string): string =>
    `lumi:addon:economy-games:cd:${scope}:${guildId}:${userId}`,
  blackjack: (guildId: string, userId: string): string =>
    `lumi:addon:economy-games:bj:${guildId}:${userId}`,
  roulette: (guildId: string, userId: string): string =>
    `lumi:addon:economy-games:rl:${guildId}:${userId}`,
} as const;
