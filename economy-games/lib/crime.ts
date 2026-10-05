import type { JailRecord } from "../keys.js";

export interface CrimeTier {
  id: string;
  label: string;
  emoji: string;
  successRate: number;
  payoutMin: number;
  payoutMax: number;
  fineMin: number;
  fineMax: number;
  jailMinMinutes: number;
  jailMaxMinutes: number;
}

export const CRIME_TIERS: readonly CrimeTier[] = [
  {
    id: "pickpocket",
    label: "Pickpocket",
    emoji: "👛",
    successRate: 0.75,
    payoutMin: 30,
    payoutMax: 90,
    fineMin: 20,
    fineMax: 60,
    jailMinMinutes: 5,
    jailMaxMinutes: 15,
  },
  {
    id: "shoplift",
    label: "Shoplift",
    emoji: "🛍️",
    successRate: 0.65,
    payoutMin: 60,
    payoutMax: 160,
    fineMin: 40,
    fineMax: 110,
    jailMinMinutes: 10,
    jailMaxMinutes: 30,
  },
  {
    id: "burglary",
    label: "Burglary",
    emoji: "🏠",
    successRate: 0.55,
    payoutMin: 120,
    payoutMax: 320,
    fineMin: 80,
    fineMax: 220,
    jailMinMinutes: 20,
    jailMaxMinutes: 60,
  },
  {
    id: "heist",
    label: "Bank Heist",
    emoji: "🏦",
    successRate: 0.4,
    payoutMin: 250,
    payoutMax: 700,
    fineMin: 150,
    fineMax: 450,
    jailMinMinutes: 45,
    jailMaxMinutes: 120,
  },
  {
    id: "cybercrime",
    label: "Cybercrime",
    emoji: "💻",
    successRate: 0.3,
    payoutMin: 450,
    payoutMax: 1200,
    fineMin: 250,
    fineMax: 700,
    jailMinMinutes: 90,
    jailMaxMinutes: 240,
  },
];

export interface CrimeOutcome {
  success: boolean;
  amount: number;
  jailMinutes: number;
}

function rangeInt(
  random: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function findCrimeTier(id: string): CrimeTier | undefined {
  return CRIME_TIERS.find((tier) => tier.id === id);
}

export function resolveCrime(
  tier: CrimeTier,
  random: () => number = Math.random,
): CrimeOutcome {
  if (random() < tier.successRate) {
    return {
      success: true,
      amount: rangeInt(random, tier.payoutMin, tier.payoutMax),
      jailMinutes: 0,
    };
  }
  return {
    success: false,
    amount: rangeInt(random, tier.fineMin, tier.fineMax),
    jailMinutes: rangeInt(random, tier.jailMinMinutes, tier.jailMaxMinutes),
  };
}

export function isJailed(
  record: JailRecord | null,
  now: number = Date.now(),
): boolean {
  return record !== null && record.until > now;
}
