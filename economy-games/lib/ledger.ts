import type { CurrencyConfig } from "./config.js";

export interface WalletView {
  wallet: number;
  bank: number;
  total: number;
}

export interface MutationInput {
  guildId: string;
  userId: string;
  walletDelta: number;
  bankDelta: number;
  kind: string;
  reason?: string;
  startWallet: number;
  startBank: number;
}

export interface GamesLedger {
  findAccount(
    guildId: string,
    userId: string,
  ): Promise<WalletView | null>;
  ensureAccount(
    guildId: string,
    userId: string,
    startWallet: number,
    startBank: number,
  ): Promise<WalletView>;
  applyMutation(input: MutationInput): Promise<WalletView>;
}

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
    (err as Error & { code?: string }).code === "InsufficientFunds"
  );
}

export async function debitBet(
  ledger: GamesLedger,
  currency: CurrencyConfig,
  guildId: string,
  userId: string,
  amount: number,
  kind: string,
  reason: string,
): Promise<WalletView> {
  try {
    return await ledger.applyMutation({
      guildId,
      userId,
      walletDelta: -amount,
      bankDelta: 0,
      kind,
      reason,
      startWallet: currency.startingWallet,
      startBank: currency.startingBank,
    });
  } catch (err) {
    if (isInsufficient(err)) {
      const balance = await ledger.ensureAccount(
        guildId,
        userId,
        currency.startingWallet,
        currency.startingBank,
      );
      throw new LedgerInsufficientFunds(balance.wallet);
    }
    throw err;
  }
}

export async function creditCapped(
  ledger: GamesLedger,
  currency: CurrencyConfig,
  guildId: string,
  userId: string,
  amount: number,
  kind: string,
  reason: string,
): Promise<{ balance: WalletView; credited: number }> {
  const current = await ledger.ensureAccount(
    guildId,
    userId,
    currency.startingWallet,
    currency.startingBank,
  );
  const headroom = Math.max(0, currency.maxBalance - current.total);
  const credited = Math.min(amount, headroom);
  if (credited <= 0) return { balance: current, credited: 0 };
  const balance = await ledger.applyMutation({
    guildId,
    userId,
    walletDelta: credited,
    bankDelta: 0,
    kind,
    reason,
    startWallet: currency.startingWallet,
    startBank: currency.startingBank,
  });
  return { balance, credited };
}
