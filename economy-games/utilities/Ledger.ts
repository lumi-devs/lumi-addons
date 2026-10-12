import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { deposit, getBalance, withdraw } from "@lumi-devs/lumi/lib/api/economy/Bank.js";

export class LedgerInsufficientFunds extends Error {
  public readonly wallet: number;

  public constructor(wallet: number) {
    super(
      `Insufficient funds (wallet: ${wallet.toLocaleString("en-US")}).`,
    );
    this.name = "LedgerInsufficientFunds";
    this.wallet = wallet;
  }
}

function isInsufficient(err: unknown): boolean {
  return (
    err instanceof Error &&
    ((err as Error & { code?: string }).code === "InsufficientFunds" ||
      err.name === "InsufficientFunds" ||
      err.message.toLowerCase().includes("insufficient"))
  );
}

export async function walletOf(
  services: Container,
  guildId: string,
  userId: string,
): Promise<number> {
  return (await getBalance(services, guildId, userId)).wallet;
}

export async function debitBet(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
): Promise<number> {
  try {
    return (await withdraw(services, guildId, userId, amount)).wallet;
  } catch (err) {
    if (isInsufficient(err)) {
      throw new LedgerInsufficientFunds(await walletOf(services, guildId, userId));
    }
    throw err;
  }
}

export async function creditWinnings(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ wallet: number; credited: number }> {
  if (amount <= 0) {
    return { wallet: await walletOf(services, guildId, userId), credited: 0 };
  }
  const balance = await deposit(services, guildId, userId, amount).catch(() => null);
  if (!balance) {
    return { wallet: await walletOf(services, guildId, userId), credited: 0 };
  }
  return { wallet: balance.wallet, credited: amount };
}
