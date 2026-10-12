import type { Container } from "#src/lib/Services.js";
import { parseDuration } from "#src/lib/utilities/Time.js";
import { MODULE_NAME } from "./Keys.js";

export interface CurrencyView {
  name: string;
  emoji: string;
}

export interface GamesConfig {
  blackjackMinBet: number;
  blackjackMaxBet: number;
  blackjackPayout: number;
  rouletteMinBet: number;
  rouletteMaxBet: number;
  crimeCooldownMs: number;
  workCooldownMs: number;
  begCooldownMs: number;
  fishCooldownMs: number;
  mineCooldownMs: number;
  useRewardMin: number;
  useRewardMax: number;
  shopItems: string[];
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asDurationMs(value: unknown, fallback: number): number {
  if (typeof value !== "string") return fallback;
  return parseDuration(value) ?? fallback;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export async function getGamesConfig(
  services: Container,
  guildId: string,
): Promise<GamesConfig> {
  const get = (key: string) =>
    services.db.config.getModuleConfig(guildId, MODULE_NAME, key);
  const [
    blackjackMinBet,
    blackjackMaxBet,
    blackjackPayout,
    rouletteMinBet,
    rouletteMaxBet,
    crimeCooldown,
    workCooldown,
    begCooldown,
    fishCooldown,
    mineCooldown,
    useRewardMin,
    useRewardMax,
    shopItems,
  ] = await Promise.all([
    get("blackjack_min_bet"),
    get("blackjack_max_bet"),
    get("blackjack_payout"),
    get("roulette_min_bet"),
    get("roulette_max_bet"),
    get("crime_cooldown"),
    get("work_cooldown"),
    get("beg_cooldown"),
    get("fish_cooldown"),
    get("mine_cooldown"),
    get("use_reward_min"),
    get("use_reward_max"),
    get("shop_items"),
  ]);
  return {
    blackjackMinBet: Math.max(1, Math.floor(asNumber(blackjackMinBet, 5))),
    blackjackMaxBet: Math.max(1, Math.floor(asNumber(blackjackMaxBet, 500))),
    blackjackPayout: Math.min(5, Math.max(1, asNumber(blackjackPayout, 1.5))),
    rouletteMinBet: Math.max(1, Math.floor(asNumber(rouletteMinBet, 5))),
    rouletteMaxBet: Math.max(1, Math.floor(asNumber(rouletteMaxBet, 500))),
    crimeCooldownMs: Math.max(0, asDurationMs(crimeCooldown, 10 * 60 * 1000)),
    workCooldownMs: Math.max(0, asDurationMs(workCooldown, 30 * 60 * 1000)),
    begCooldownMs: Math.max(0, asDurationMs(begCooldown, 2 * 60 * 1000)),
    fishCooldownMs: Math.max(0, asDurationMs(fishCooldown, 10 * 60 * 1000)),
    mineCooldownMs: Math.max(0, asDurationMs(mineCooldown, 10 * 60 * 1000)),
    useRewardMin: Math.max(0, Math.floor(asNumber(useRewardMin, 20))),
    useRewardMax: Math.max(0, Math.floor(asNumber(useRewardMax, 120))),
    shopItems: asStringList(shopItems),
  };
}

export function formatAmount(currency: CurrencyView, amount: number): string {
  return `${currency.emoji} ${amount.toLocaleString("en-US")} ${currency.name}`;
}

export function validateBet(
  bet: number,
  min: number,
  max: number,
): string | null {
  if (!Number.isInteger(bet) || bet <= 0)
    return "Bet must be a positive whole number.";
  if (bet < min || bet > max)
    return `Bet must be between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}.`;
  return null;
}
