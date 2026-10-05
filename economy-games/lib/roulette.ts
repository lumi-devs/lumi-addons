export type RouletteBetType =
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high"
  | "green"
  | "number";

export const ROULETTE_BET_TYPES: readonly RouletteBetType[] = [
  "red",
  "black",
  "odd",
  "even",
  "low",
  "high",
  "green",
  "number",
];

export const ROULETTE_REDS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type RouletteColor = "red" | "black" | "green";

export interface RoulettePending {
  userId: string;
  bet: number;
  target: number | null;
}

export interface RouletteResult {
  number: number;
  color: RouletteColor;
  won: boolean;
  profit: number;
}

export function spinRoulette(random: () => number = Math.random): number {
  return Math.floor(random() * 37);
}

export function rouletteColor(number: number): RouletteColor {
  if (number === 0) return "green";
  return ROULETTE_REDS.has(number) ? "red" : "black";
}

export function resolveRouletteBet(
  type: RouletteBetType,
  number: number,
  target: number | null,
  bet: number,
): RouletteResult {
  const color = rouletteColor(number);
  if (type === "red" || type === "black") {
    const won = color === type;
    return { number, color, won, profit: won ? bet : 0 };
  }
  if (type === "odd" || type === "even") {
    const won =
      number !== 0 &&
      (type === "odd" ? number % 2 === 1 : number % 2 === 0);
    return { number, color, won, profit: won ? bet : 0 };
  }
  if (type === "low" || type === "high") {
    const won =
      type === "low"
        ? number >= 1 && number <= 18
        : number >= 19 && number <= 36;
    return { number, color, won, profit: won ? bet : 0 };
  }
  if (type === "green") {
    const won = number === 0;
    return { number, color, won, profit: won ? bet * 35 : 0 };
  }
  const won = target !== null && number === target;
  return { number, color, won, profit: won ? bet * 35 : 0 };
}

export function rouletteBetLabel(
  type: RouletteBetType,
  target: number | null,
): string {
  if (type === "number") return `number ${target ?? "?"}`;
  if (type === "low") return "low (1-18)";
  if (type === "high") return "high (19-36)";
  if (type === "green") return "green (0)";
  return type;
}
