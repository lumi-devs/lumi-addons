import { container } from "@sapphire/framework";
import { parseDuration } from "lumi/utils";
import { ECONOMY_MODULE_NAME, MODULE_NAME } from "../keys.js";

export interface CurrencyConfig {
  name: string;
  emoji: string;
  startingWallet: number;
  startingBank: number;
  maxBalance: number;
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

export async function getCurrency(guildId: string): Promise<CurrencyConfig> {
  const get = (key: string): Promise<unknown> =>
    container.db.config.getModuleConfig(guildId, ECONOMY_MODULE_NAME, key);
  const [name, emoji, startingWallet, startingBank, maxBalance] =
    await Promise.all([
      get("currency_name"),
      get("currency_emoji"),
      get("starting_wallet"),
      get("starting_bank"),
      get("max_balance"),
    ]);
  return {
    name:
      typeof name === "string" && name.length > 0 ? name : "credits",
    emoji:
      typeof emoji === "string" && emoji.length > 0 ? emoji : "🪙",
    startingWallet: Math.max(0, Math.floor(asNumber(startingWallet, 100))),
    startingBank: Math.max(0, Math.floor(asNumber(startingBank, 0))),
    maxBalance: Math.max(1000, Math.floor(asNumber(maxBalance, 1000000))),
  };
}

export async function getGamesConfig(guildId: string): Promise<GamesConfig> {
  const get = (key: string): Promise<unknown> =>
    container.db.config.getModuleConfig(guildId, MODULE_NAME, key);
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
    get("blackjackMinBet"),
    get("blackjackMaxBet"),
    get("blackjackPayout"),
    get("rouletteMinBet"),
    get("rouletteMaxBet"),
    get("crimeCooldown"),
    get("workCooldown"),
    get("begCooldown"),
    get("fishCooldown"),
    get("mineCooldown"),
    get("useRewardMin"),
    get("useRewardMax"),
    get("shopItems"),
  ]);
  return {
    blackjackMinBet: Math.max(1, Math.floor(asNumber(blackjackMinBet, 5))),
    blackjackMaxBet: Math.max(1, Math.floor(asNumber(blackjackMaxBet, 500))),
    blackjackPayout: Math.min(
      5,
      Math.max(1, asNumber(blackjackPayout, 1.5)),
    ),
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

export function formatAmount(
  currency: CurrencyConfig,
  amount: number,
): string {
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
