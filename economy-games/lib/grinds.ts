import {
  creditCapped,
  type GamesLedger,
  type WalletView,
} from "./ledger.js";
import type { CurrencyConfig } from "./config.js";

export type GrindKind = "work" | "beg" | "fish" | "mine";

export interface GrindDef {
  kind: GrindKind;
  label: string;
  emoji: string;
  min: number;
  max: number;
  bonusChance: number;
  bonusMin: number;
  bonusMax: number;
  flavors: string[];
}

export const GRIND_DEFS: Record<GrindKind, GrindDef> = {
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
      "You debugged three tickets before lunch. Promotion energy.",
      "You carried the whole standup. Management noticed.",
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
      "You rattled your cup on the corner. A stranger took pity.",
      "You asked nicely. Someone tossed you pocket change.",
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
      "You reeled in a fat one. The monger paid well.",
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
      "You struck a glimmering vein. The assayer smiled.",
      "A long shift in the dark, but the cart came up heavy.",
    ],
  },
};

export interface GrindOutcome {
  amount: number;
  bonus: number;
  flavor: string;
}

function rangeInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function rollGrind(
  def: GrindDef,
  random: () => number = Math.random,
): GrindOutcome {
  const amount = rangeInt(random, def.min, def.max);
  const bonus =
    random() < def.bonusChance
      ? rangeInt(random, def.bonusMin, def.bonusMax)
      : 0;
  const flavor = def.flavors[Math.floor(random() * def.flavors.length)]!;
  return { amount, bonus, flavor };
}

export async function playGrind(
  ledger: GamesLedger,
  currency: CurrencyConfig,
  guildId: string,
  userId: string,
  kind: GrindKind,
  random: () => number = Math.random,
): Promise<GrindOutcome & { balance: WalletView; credited: number }> {
  const rolled = rollGrind(GRIND_DEFS[kind], random);
  const { balance, credited } = await creditCapped(
    ledger,
    currency,
    guildId,
    userId,
    rolled.amount + rolled.bonus,
    `games_grind_${kind}`,
    `${kind} grind paid ${rolled.amount}${rolled.bonus > 0 ? ` plus ${rolled.bonus} bonus` : ""}`,
  );
  return { ...rolled, balance, credited };
}
