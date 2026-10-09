export const MODULE_NAME = "economy-games";

export const JAIL_KEY = "jail";

export const INVENTORY_KEY = "inventory";

export const BALANCE_KEY = "balance";

export const BLACKJACK_KEY = "game:blackjack";

export const ROULETTE_KEY = "game:roulette";

export const SHOP_SCOPE = "shop";

export const stockKey = (name: string): string =>
  `stock:${name.toLowerCase()}`;

export interface JailRecord {
  until: number;
  reason: string;
}
