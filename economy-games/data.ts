import { randomInt } from "node:crypto";
import type { ModuleServices } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type ChatInputCommandInteraction,
  type Guild,
  PermissionFlagsBits,
} from "discord.js";
import { z } from "zod";

export const ModuleName = "economy-games";
export const ConfigKey = "economy-games-config";
export const BlackjackKey = "blackjack";
export const JailKey = "jail";
export const InventoryPrefix = "inventory:";
export const StockPrefix = "stock:";
export const BlackjackExpiryMs = 5 * 60 * 1000;
const BlackjackRecordTtlMs = 60 * 60 * 1000;
export const LockTtlMs = 15_000;

export const ConfigSchema = z.object({
  blackjackMin: z.coerce.number().int().min(1).default(5),
  blackjackMax: z.coerce.number().int().min(1).default(500),
  blackjackPayout: z.coerce.number().min(1).max(5).default(2.5),
  rouletteMin: z.coerce.number().int().min(1).default(5),
  rouletteMax: z.coerce.number().int().min(1).default(500),
  crimeCooldownMinutes: z.coerce.number().int().min(0).max(10_080).default(10),
  workCooldownMinutes: z.coerce.number().int().min(0).max(10_080).default(30),
  begCooldownMinutes: z.coerce.number().int().min(0).max(10_080).default(2),
  fishCooldownMinutes: z.coerce.number().int().min(0).max(10_080).default(10),
  mineCooldownMinutes: z.coerce.number().int().min(0).max(10_080).default(10),
  consumableMin: z.coerce.number().int().min(0).default(20),
  consumableMax: z.coerce.number().int().min(0).default(120),
  shopItems: z.string().default(""),
});

export type EconomyGamesConfig = z.infer<typeof ConfigSchema>;

export async function getConfig(
  services: ModuleServices,
  guildId: string,
): Promise<EconomyGamesConfig> {
  let stored: unknown = null;
  try {
    stored = await services.moduleConfig.read(
      guildId,
      services.moduleName ?? ModuleName,
      ConfigKey,
    );
  } catch (error) {
    services.observability.logger.warn("config read failed", {
      guildId,
      error,
    });
  }
  const parsed = ConfigSchema.safeParse(stored ?? {});
  if (!parsed.success) {
    services.observability.logger.warn("invalid config, using defaults", {
      guildId,
      issues: parsed.error.issues,
    });
  }
  const config = parsed.success ? parsed.data : ConfigSchema.parse({});
  return {
    ...config,
    blackjackMax: Math.max(config.blackjackMin, config.blackjackMax),
    rouletteMax: Math.max(config.rouletteMin, config.rouletteMax),
    consumableMax: Math.max(config.consumableMin, config.consumableMax),
  };
}

export async function requireGuildId(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<string | null> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Server Only", "This command only works inside a server."),
      ),
    );
    return null;
  }
  if (!services.modules.isEnabled(guildId, ModuleName)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Module Disabled",
          "Economy Games is disabled in this server.",
        ),
      ),
    );
    return null;
  }
  return guildId;
}

export function validateBet(
  bet: number,
  min: number,
  max: number,
): string | null {
  if (!Number.isInteger(bet) || bet <= 0) {
    return "Bet must be a positive whole number.";
  }
  if (bet < min || bet > max) {
    return `Bet must be between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}.`;
  }
  return null;
}

export function formatMoney(amount: bigint): string {
  return `🪙 ${amount.toLocaleString("en-US")}`;
}

const LocalLocks = new Map<string, Promise<void>>();
const LocalCooldowns = new Map<string, number>();

export function userLockKey(
  kind: string,
  guildId: string,
  userId: string,
): string {
  return `${ModuleName}:lock:${kind}:${guildId}:${userId}`;
}

export async function withLock<T>(
  services: ModuleServices,
  key: string,
  ttlMs: number,
  task: () => Promise<T>,
): Promise<T | null> {
  const cache = services.helpers.cache;
  if (cache.distributed) {
    const release = await cache.takeLock(key, ttlMs).catch(() => null);
    if (!release) return null;
    try {
      return await task();
    } finally {
      await release().catch(() => undefined);
    }
  }

  const previous = LocalLocks.get(key) ?? Promise.resolve();
  const tail = previous.catch(() => undefined).then(() => task());
  const settled = tail.then(
    () => undefined,
    () => undefined,
  );
  LocalLocks.set(key, settled);
  try {
    return await tail;
  } finally {
    if (LocalLocks.get(key) === settled) LocalLocks.delete(key);
  }
}

export interface CooldownClaim {
  ok: boolean;
  expiresAt: number;
}

export async function claimCooldown(
  services: ModuleServices,
  guildId: string,
  userId: string,
  kind: string,
  ms: number,
): Promise<CooldownClaim> {
  const now = Date.now();
  const duration = Math.floor(ms);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { ok: true, expiresAt: now };
  }
  const expiresAt = now + duration;
  const key = `${ModuleName}:cooldown:${guildId}:${userId}:${kind}`;
  const cache = services.helpers.cache;
  if (!cache.distributed) {
    if (LocalCooldowns.size > 1_000) {
      for (const [entryKey, expiry] of LocalCooldowns) {
        if (expiry <= now) LocalCooldowns.delete(entryKey);
      }
    }
    const existing = LocalCooldowns.get(key);
    if (existing !== undefined && existing > now) {
      return { ok: false, expiresAt: existing };
    }
    LocalCooldowns.set(key, expiresAt);
    return { ok: true, expiresAt };
  }
  const claimed = await cache
    .setNx(key, String(expiresAt), duration)
    .catch(() => false);
  if (claimed) return { ok: true, expiresAt };

  const raw = await cache.getString(key).catch(() => null);
  const stored = raw === null ? Number.NaN : Number(raw);
  if (Number.isFinite(stored) && stored > now) {
    return { ok: false, expiresAt: stored };
  }

  const retried = await cache
    .setNx(key, String(expiresAt), duration)
    .catch(() => false);
  if (retried) return { ok: true, expiresAt };

  const fallback = await cache.getString(key).catch(() => null);
  const fallbackAt = fallback === null ? Number.NaN : Number(fallback);
  return {
    ok: false,
    expiresAt:
      Number.isFinite(fallbackAt) && fallbackAt > now
        ? fallbackAt
        : now + duration,
  };
}

export interface JailRecord {
  expiresAt: number;
  reason: string;
}

export async function getActiveJail(
  services: ModuleServices,
  guildId: string,
  userId: string,
  now = Date.now(),
): Promise<JailRecord | null> {
  const raw = await services.helpers.moduleData.get<unknown>(
    guildId,
    ModuleName,
    userId,
    JailKey,
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const expiresAt = record.expiresAt;
  if (
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  ) {
    return null;
  }
  const reason = typeof record.reason === "string" ? record.reason : "crime";
  return { expiresAt, reason };
}

export async function setJail(
  services: ModuleServices,
  guildId: string,
  userId: string,
  minutes: number,
  reason: string,
): Promise<number> {
  const ms = Math.max(0, Math.floor(minutes * 60_000));
  if (ms <= 0) {
    await services.helpers.moduleData.delete(
      guildId,
      ModuleName,
      userId,
      JailKey,
    );
    return Date.now();
  }
  const expiresAt = Date.now() + ms;
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    userId,
    JailKey,
    { expiresAt, reason },
    { ttlMs: ms },
  );
  return expiresAt;
}

export const Ranks = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

export const Suits = ["spades", "hearts", "diamonds", "clubs"] as const;

export type Rank = (typeof Ranks)[number];
export type Suit = (typeof Suits)[number];

export interface GameCard {
  rank: Rank;
  suit: Suit;
}

const GameCardSchema = z.object({
  rank: z.enum(Ranks),
  suit: z.enum(Suits),
});

export type BlackjackOutcome =
  | "playerBlackjack"
  | "playerWin"
  | "dealerWin"
  | "playerBust"
  | "dealerBust"
  | "push";

export const BlackjackStateSchema = z.object({
  userId: z.string().min(1),
  bet: z.number().int().positive(),
  deck: z.array(GameCardSchema),
  player: z.array(GameCardSchema).min(2),
  dealer: z.array(GameCardSchema).min(2),
  expiresAt: z.number().int().positive(),
  nonce: z.string().min(1),
});

export type BlackjackState = z.infer<typeof BlackjackStateSchema>;

const SuitGlyphs: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export function buildDeck(): GameCard[] {
  const deck: GameCard[] = [];
  for (const suit of Suits) {
    for (const rank of Ranks) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffleDeck(deck: readonly GameCard[]): GameCard[] {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const current = cards[i];
    const swapped = cards[j];
    if (current === undefined || swapped === undefined) continue;
    cards[i] = swapped;
    cards[j] = current;
  }
  return cards;
}

export function drawCard(deck: GameCard[]): GameCard {
  const card = deck.pop();
  if (!card) throw new Error("Blackjack deck is empty.");
  return card;
}

export function handValue(hand: readonly GameCard[]): number {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      aces += 1;
      total += 11;
    } else if (card.rank === "J" || card.rank === "Q" || card.rank === "K") {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

export function isBlackjack(hand: readonly GameCard[]): boolean {
  return hand.length === 2 && handValue(hand) === 21;
}

export function isBust(hand: readonly GameCard[]): boolean {
  return handValue(hand) > 21;
}

export function dealerShouldHit(hand: readonly GameCard[]): boolean {
  return handValue(hand) < 17;
}

export function playDealer(
  deck: readonly GameCard[],
  hand: readonly GameCard[],
): GameCard[] {
  const rest = [...deck];
  const current = [...hand];
  while (dealerShouldHit(current)) {
    const next = rest.pop();
    if (!next) break;
    current.push(next);
  }
  return current;
}

export function decideOutcome(
  player: readonly GameCard[],
  dealer: readonly GameCard[],
): BlackjackOutcome {
  const playerNatural = isBlackjack(player);
  const dealerNatural = isBlackjack(dealer);
  if (playerNatural || dealerNatural) {
    if (playerNatural && dealerNatural) return "push";
    return playerNatural ? "playerBlackjack" : "dealerWin";
  }
  if (isBust(player)) return "playerBust";
  if (isBust(dealer)) return "dealerBust";
  const playerValue = handValue(player);
  const dealerValue = handValue(dealer);
  if (playerValue > dealerValue) return "playerWin";
  if (playerValue < dealerValue) return "dealerWin";
  return "push";
}

export function naturalPayout(bet: bigint, multiplier: number): bigint {
  const total = Math.floor(Number(bet) * multiplier);
  return total > 0 ? BigInt(total) : 0n;
}

export function cardLabel(card: GameCard): string {
  return `${card.rank}${SuitGlyphs[card.suit]}`;
}

export function handLabel(hand: readonly GameCard[], hideHole: boolean): string {
  if (hideHole && hand.length > 1) {
    const first = hand[0];
    return first ? `${cardLabel(first)} • hidden` : "hidden";
  }
  return hand.map(cardLabel).join(" ");
}

export interface BlackjackSettlement {
  outcome: BlackjackOutcome;
  bet: bigint;
  credited: bigint;
  net: bigint;
  playerValue: number;
  dealerValue: number;
  dealer: GameCard[];
}

export async function settleBlackjack(
  services: ModuleServices,
  guildId: string,
  userId: string,
  state: BlackjackState,
  config: EconomyGamesConfig,
): Promise<BlackjackSettlement> {
  let dealer = [...state.dealer];
  if (
    !isBlackjack(state.player) &&
    !isBlackjack(dealer) &&
    !isBust(state.player)
  ) {
    dealer = playDealer(state.deck, dealer);
  }
  const outcome = decideOutcome(state.player, dealer);
  const bet = BigInt(state.bet);
  let credited = 0n;

  if (outcome === "push") {
    await services.helpers.economy.refund(guildId, userId, bet, {
      type: "blackjack_refund",
      description: "Blackjack push",
    });
    credited = bet;
  } else if (outcome === "playerBlackjack") {
    credited = naturalPayout(bet, config.blackjackPayout);
    if (credited > 0n) {
      await services.helpers.economy.credit(guildId, userId, credited, {
        ledger: {
          type: "blackjack_payout",
          description: "Natural blackjack payout",
        },
      });
    }
  } else if (outcome === "playerWin" || outcome === "dealerBust") {
    credited = bet * 2n;
    await services.helpers.economy.credit(guildId, userId, credited, {
      ledger: { type: "blackjack_payout", description: "Blackjack win" },
    });
  }

  return {
    outcome,
    bet,
    credited,
    net: credited - bet,
    playerValue: handValue(state.player),
    dealerValue: handValue(dealer),
    dealer,
  };
}

function parseState(raw: unknown): BlackjackState | null {
  const parsed = BlackjackStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function getBlackjack(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<BlackjackState | null> {
  const raw = await services.helpers.moduleData.get<unknown>(
    guildId,
    ModuleName,
    userId,
    BlackjackKey,
  );
  return parseState(raw);
}

export async function takeBlackjack(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<BlackjackState | null> {
  const raw = await services.helpers.moduleData.take<unknown>(
    guildId,
    ModuleName,
    userId,
    BlackjackKey,
  );
  return parseState(raw);
}

export async function saveBlackjack(
  services: ModuleServices,
  guildId: string,
  state: BlackjackState,
): Promise<void> {
  const remaining = state.expiresAt - Date.now() + 60_000;
  const ttlMs = Math.max(BlackjackRecordTtlMs, remaining);
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    state.userId,
    BlackjackKey,
    state,
    { ttlMs },
  );
}

export async function sweepBlackjacks(
  services: ModuleServices,
): Promise<number> {
  const entries = await services.helpers.moduleData.list<unknown>({
    moduleName: ModuleName,
    key: BlackjackKey,
  });
  let refunded = 0;

  for (const entry of entries) {
    const state = parseState(entry.value);
    if (!state) {
      await services.helpers.moduleData
        .take(entry.guildId, ModuleName, entry.targetId, BlackjackKey)
        .catch(() => null);
      continue;
    }
    if (state.expiresAt > Date.now()) continue;

    try {
      const taken = parseState(
        await services.helpers.moduleData.take(
          entry.guildId,
          ModuleName,
          entry.targetId,
          BlackjackKey,
        ),
      );
      if (!taken) continue;
      if (taken.expiresAt > Date.now()) {
        await saveBlackjack(services, entry.guildId, taken);
        continue;
      }
      await services.helpers.economy.refund(
        entry.guildId,
        entry.targetId,
        BigInt(taken.bet),
        {
          type: "blackjack_expired_refund",
          description: "Expired blackjack refund",
        },
      );
      refunded += 1;
    } catch (error) {
      services.observability.logger.warn("blackjack sweep failed", {
        guildId: entry.guildId,
        error,
      });
    }
  }

  return refunded;
}

export type RouletteBetKind =
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high"
  | "green"
  | "number";

export interface RouletteBet {
  kind: RouletteBetKind;
  number: number | null;
  label: string;
}

const NamedRouletteChoices = [
  "red",
  "black",
  "odd",
  "even",
  "low",
  "high",
  "green",
] as const;

const RouletteReds: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function parseRouletteChoice(raw: string): RouletteBet | null {
  const value = raw.trim().toLowerCase();
  const named = NamedRouletteChoices.find((choice) => choice === value);
  if (named) return { kind: named, number: null, label: named };
  if (!/^\d{1,2}$/.test(value)) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 36) return null;
  return { kind: "number", number, label: `number ${number}` };
}

export function spinRoulette(): number {
  return randomInt(37);
}

export function rouletteColor(number: number): "red" | "black" | "green" {
  if (number === 0) return "green";
  return RouletteReds.has(number) ? "red" : "black";
}

export function resolveRoulette(
  bet: bigint,
  choice: RouletteBet,
  landed: number,
): { won: boolean; payout: bigint } {
  const color = rouletteColor(landed);
  let won = false;
  switch (choice.kind) {
    case "red":
    case "black":
      won = color === choice.kind;
      break;
    case "odd":
      won = landed !== 0 && landed % 2 === 1;
      break;
    case "even":
      won = landed !== 0 && landed % 2 === 0;
      break;
    case "low":
      won = landed >= 1 && landed <= 18;
      break;
    case "high":
      won = landed >= 19 && landed <= 36;
      break;
    case "green":
      won = landed === 0;
      break;
    case "number":
      won = choice.number !== null && landed === choice.number;
      break;
  }
  if (!won) return { won: false, payout: 0n };
  const payout =
    choice.kind === "green" || choice.kind === "number" ? bet * 36n : bet * 2n;
  return { won: true, payout };
}

export type CrimeTierId = "low" | "medium" | "high";

export interface CrimeTier {
  id: CrimeTierId;
  label: string;
  emoji: string;
  successRate: number;
  payoutMin: number;
  payoutMax: number;
}

export const CrimeTiers: readonly CrimeTier[] = [
  {
    id: "low",
    label: "Low Risk",
    emoji: "👛",
    successRate: 0.7,
    payoutMin: 40,
    payoutMax: 120,
  },
  {
    id: "medium",
    label: "Medium Risk",
    emoji: "🏠",
    successRate: 0.55,
    payoutMin: 120,
    payoutMax: 300,
  },
  {
    id: "high",
    label: "High Risk",
    emoji: "🏦",
    successRate: 0.4,
    payoutMin: 300,
    payoutMax: 750,
  },
];

export function findCrimeTier(id: string): CrimeTier | undefined {
  return CrimeTiers.find((tier) => tier.id === id);
}

export interface CrimeOutcome {
  tier: CrimeTier;
  success: boolean;
  payout: bigint;
}

export function rollCrime(tier: CrimeTier): CrimeOutcome {
  const success = randomInt(10_000) < Math.round(tier.successRate * 10_000);
  const payout = success
    ? BigInt(randomInclusive(tier.payoutMin, tier.payoutMax))
    : 0n;
  return { tier, success, payout };
}

export type GrindKind = "work" | "beg" | "fish" | "mine";

export interface GrindDefinition {
  kind: GrindKind;
  label: string;
  emoji: string;
  min: number;
  max: number;
  bonusChance: number;
  bonusMin: number;
  bonusMax: number;
  flavors: readonly string[];
}

export const Grinds: Record<GrindKind, GrindDefinition> = {
  work: {
    kind: "work",
    label: "Work",
    emoji: "💼",
    min: 80,
    max: 200,
    bonusChance: 0.12,
    bonusMin: 100,
    bonusMax: 250,
    flavors: [
      "You pulled a double shift at the pixel factory.",
      "You cleared three tickets before lunch and caught the manager's eye.",
      "You carried the whole standup and got a bonus for it.",
    ],
  },
  beg: {
    kind: "beg",
    label: "Beg",
    emoji: "🥺",
    min: 5,
    max: 60,
    bonusChance: 0.08,
    bonusMin: 50,
    bonusMax: 150,
    flavors: [
      "You rattled a cup on the corner and a stranger took pity.",
      "You asked nicely and someone tossed you pocket change.",
      "You made puppy eyes at the tavern crowd.",
    ],
  },
  fish: {
    kind: "fish",
    label: "Fish",
    emoji: "🎣",
    min: 30,
    max: 130,
    bonusChance: 0.1,
    bonusMin: 80,
    bonusMax: 200,
    flavors: [
      "You sold the morning catch at the docks.",
      "You reeled in a fat one and the monger paid well.",
      "Calm waters, full nets, easy money.",
    ],
  },
  mine: {
    kind: "mine",
    label: "Mine",
    emoji: "⛏️",
    min: 40,
    max: 150,
    bonusChance: 0.1,
    bonusMin: 90,
    bonusMax: 220,
    flavors: [
      "You hauled a cart of ore up from the deep shaft.",
      "You struck a glimmering vein and the assayer smiled.",
      "A long shift in the dark, but the cart came up heavy.",
    ],
  },
};

export interface GrindOutcome {
  amount: bigint;
  bonus: bigint;
  total: bigint;
  flavor: string;
}

export function rollGrind(definition: GrindDefinition): GrindOutcome {
  const amount = BigInt(randomInclusive(definition.min, definition.max));
  const bonusHit =
    randomInt(10_000) < Math.round(definition.bonusChance * 10_000);
  const bonus = bonusHit
    ? BigInt(randomInclusive(definition.bonusMin, definition.bonusMax))
    : 0n;
  const flavor =
    definition.flavors[randomInt(definition.flavors.length)] ?? "";
  return { amount, bonus, total: amount + bonus, flavor };
}

export function cooldownMinutesFor(
  config: EconomyGamesConfig,
  kind: GrindKind,
): number {
  switch (kind) {
    case "work":
      return config.workCooldownMinutes;
    case "beg":
      return config.begCooldownMinutes;
    case "fish":
      return config.fishCooldownMinutes;
    case "mine":
      return config.mineCooldownMinutes;
  }
}

export function rollConsumableReward(config: EconomyGamesConfig): bigint {
  return BigInt(randomInclusive(config.consumableMin, config.consumableMax));
}

export interface ShopItem {
  name: string;
  key: string;
  price: number;
  description: string;
  roleId: string | null;
  consumable: boolean;
  stock: number | null;
}

const RoleIdPattern = /^\d{17,20}$/;

function parsePrice(raw: string): number | null {
  const parsed = Number(raw.replace(/,/g, "").trim());
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseStock(raw: string): number | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function parseShopItems(raw: string): ShopItem[] {
  const items: ShopItem[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const entry = line.trim();
    if (entry.length === 0 || entry.startsWith("#")) continue;
    const parts = entry.split("|").map((part) => part.trim());
    const name = parts[0] ?? "";
    if (name.length === 0 || name.length > 64) continue;
    const price = parsePrice(parts[1] ?? "");
    if (price === null) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const roleRaw = parts[3] ?? "";
    const consumableRaw = (parts[4] ?? "").toLowerCase();
    items.push({
      name,
      key,
      price,
      description: (parts[2] ?? "").slice(0, 200),
      roleId: RoleIdPattern.test(roleRaw) ? roleRaw : null,
      consumable:
        consumableRaw === "yes" ||
        consumableRaw === "true" ||
        consumableRaw === "1" ||
        consumableRaw === "y",
      stock: parseStock(parts[5] ?? ""),
    });
  }
  return items;
}

export function findShopItem(
  items: readonly ShopItem[],
  name: string,
): ShopItem | undefined {
  const key = name.trim().toLowerCase();
  return items.find((item) => item.key === key);
}

export function findShopItemByKey(
  items: readonly ShopItem[],
  key: string,
): ShopItem | undefined {
  return items.find((item) => item.key === key);
}

export function stockKey(name: string): string {
  return `${StockPrefix}${name.trim().toLowerCase()}`;
}

export function inventoryKey(name: string): string {
  return `${InventoryPrefix}${name.trim().toLowerCase()}`;
}

export async function getSold(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<number> {
  const value = await services.helpers.moduleData.get<unknown>(
    guildId,
    ModuleName,
    "_",
    stockKey(name),
  );
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

export async function reserveStock(
  services: ModuleServices,
  guildId: string,
  name: string,
  stock: number | null,
): Promise<boolean> {
  if (stock === null) return true;
  const sold = await services.helpers.moduleData.incr(
    guildId,
    ModuleName,
    "_",
    stockKey(name),
    1,
  );
  if (sold > stock) {
    await services.helpers.moduleData.incr(
      guildId,
      ModuleName,
      "_",
      stockKey(name),
      -1,
    );
    return false;
  }
  return true;
}

export async function releaseStock(
  services: ModuleServices,
  guildId: string,
  name: string,
  stock: number | null,
): Promise<void> {
  if (stock === null) return;
  await services.helpers.moduleData.incr(
    guildId,
    ModuleName,
    "_",
    stockKey(name),
    -1,
  );
}

export async function addInventory(
  services: ModuleServices,
  guildId: string,
  userId: string,
  name: string,
  delta: number,
): Promise<number> {
  return services.helpers.moduleData.incr(
    guildId,
    ModuleName,
    userId,
    inventoryKey(name),
    delta,
  );
}

export async function consumeInventory(
  services: ModuleServices,
  guildId: string,
  userId: string,
  name: string,
): Promise<number> {
  const remaining = await services.helpers.moduleData.incr(
    guildId,
    ModuleName,
    userId,
    inventoryKey(name),
    -1,
  );
  if (remaining < 0) {
    await services.helpers.moduleData.incr(
      guildId,
      ModuleName,
      userId,
      inventoryKey(name),
      1,
    );
    return -1;
  }
  return remaining;
}

export interface InventoryEntry {
  key: string;
  count: number;
}

export async function listInventory(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<InventoryEntry[]> {
  const entries = await services.helpers.moduleData.list<unknown>({
    guildId,
    moduleName: ModuleName,
    targetId: userId,
    prefix: InventoryPrefix,
  });
  const inventory: InventoryEntry[] = [];
  for (const entry of entries) {
    const value = entry.value;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    inventory.push({
      key: entry.key.slice(InventoryPrefix.length),
      count: Math.floor(value),
    });
  }
  inventory.sort((left, right) => left.key.localeCompare(right.key));
  return inventory;
}

export type RoleGrantFailure =
  | "missing_member"
  | "missing_role"
  | "managed_role"
  | "missing_permissions"
  | "failed";

export type RoleGrantResult =
  | { granted: true }
  | { granted: false; reason: RoleGrantFailure };

export async function grantRole(
  guild: Guild,
  userId: string,
  roleId: string,
): Promise<RoleGrantResult> {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { granted: false, reason: "missing_permissions" };
  }
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { granted: false, reason: "missing_member" };
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return { granted: false, reason: "missing_role" };
  if (role.managed) return { granted: false, reason: "managed_role" };
  if (role.position >= me.roles.highest.position) {
    return { granted: false, reason: "missing_permissions" };
  }
  try {
    await member.roles.add(role, "Economy Games shop");
    return { granted: true };
  } catch {
    return { granted: false, reason: "failed" };
  }
}

export type RoleToggleResult =
  | { toggled: true; equipped: boolean }
  | { toggled: false; reason: RoleGrantFailure };

export async function toggleRole(
  guild: Guild,
  userId: string,
  roleId: string,
): Promise<RoleToggleResult> {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { toggled: false, reason: "missing_permissions" };
  }
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { toggled: false, reason: "missing_member" };
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return { toggled: false, reason: "missing_role" };
  if (role.managed) return { toggled: false, reason: "managed_role" };
  if (role.position >= me.roles.highest.position) {
    return { toggled: false, reason: "missing_permissions" };
  }
  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(role, "Economy Games shop");
      return { toggled: true, equipped: false };
    }
    await member.roles.add(role, "Economy Games shop");
    return { toggled: true, equipped: true };
  } catch {
    return { toggled: false, reason: "failed" };
  }
}

export function roleToggleNote(result: RoleToggleResult): string {
  if (result.toggled) {
    return result.equipped ? "Role equipped." : "Role removed.";
  }
  return roleGrantNote({ granted: false, reason: result.reason });
}

export function roleGrantNote(result: RoleGrantResult): string {
  if (result.granted) return "Role granted.";
  switch (result.reason) {
    case "missing_member":
      return "Role not granted: the member could not be found.";
    case "missing_role":
      return "Role not granted: the configured role no longer exists.";
    case "managed_role":
      return "Role not granted: that role is managed by an integration.";
    case "missing_permissions":
      return "Role not granted: the bot lacks Manage Roles or the role is above it.";
    case "failed":
      return "Role not granted: Discord rejected the role change.";
  }
}

function randomInclusive(min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (high <= low) return low;
  return low + randomInt(high - low + 1);
}