import { get, incr, remove, set } from "lumi/kv";
import {
  BALANCE_KEY,
  INVENTORY_KEY,
  JAIL_KEY,
  SHOP_SCOPE,
  stockKey,
  type JailRecord,
} from "../keys.js";
import type { GamesLedger, MutationInput, WalletView } from "./ledger.js";

interface BalanceRow {
  wallet: number;
  bank: number;
}

function sanitizeBalance(row: BalanceRow): BalanceRow {
  return {
    wallet:
      typeof row.wallet === "number" && Number.isFinite(row.wallet)
        ? Math.max(0, Math.floor(row.wallet))
        : 0,
    bank:
      typeof row.bank === "number" && Number.isFinite(row.bank)
        ? Math.max(0, Math.floor(row.bank))
        : 0,
  };
}

function viewOf(row: BalanceRow): WalletView {
  return { wallet: row.wallet, bank: row.bank, total: row.wallet + row.bank };
}

function insufficient(): Error {
  return Object.assign(new Error("Insufficient funds."), {
    code: "InsufficientFunds",
  });
}

export function productionLedger(): GamesLedger {
  return {
    findAccount: async (guildId, userId) => {
      const row = await get<BalanceRow>(guildId, userId, BALANCE_KEY);
      return row ? viewOf(sanitizeBalance(row)) : null;
    },
    ensureAccount: async (guildId, userId, startWallet, startBank) => {
      const row = await get<BalanceRow>(guildId, userId, BALANCE_KEY);
      if (!row) {
        const seeded = sanitizeBalance({
          wallet: startWallet,
          bank: startBank,
        });
        await set(guildId, userId, BALANCE_KEY, seeded);
        return viewOf(seeded);
      }
      return viewOf(sanitizeBalance(row));
    },
    applyMutation: async (input: MutationInput) => {
      const stored = await get<BalanceRow>(
        input.guildId,
        input.userId,
        BALANCE_KEY,
      );
      const current = stored
        ? sanitizeBalance(stored)
        : sanitizeBalance({
            wallet: input.startWallet,
            bank: input.startBank,
          });
      const next = sanitizeBalance({
        wallet: current.wallet + input.walletDelta,
        bank: current.bank + input.bankDelta,
      });
      if (
        current.wallet + input.walletDelta < 0 ||
        current.bank + input.bankDelta < 0
      ) {
        throw insufficient();
      }
      await set(input.guildId, input.userId, BALANCE_KEY, next);
      return viewOf(next);
    },
  };
}

export async function claimCooldown(
  guildId: string,
  userId: string,
  scope: string,
  ms: number,
  now: number = Date.now(),
): Promise<boolean> {
  if (ms <= 0) return true;
  const key = `cd:${scope}`;
  const expiresAt = await get<number>(guildId, userId, key);
  if (expiresAt !== null && expiresAt > now) return false;
  await set(guildId, userId, key, now + ms);
  return true;
}

export async function getJail(
  guildId: string,
  userId: string,
): Promise<JailRecord | null> {
  const record = await get<JailRecord>(guildId, userId, JAIL_KEY);
  if (!record || typeof record.until !== "number") return null;
  return record;
}

export async function setJail(
  guildId: string,
  userId: string,
  record: JailRecord,
): Promise<void> {
  await set(guildId, userId, JAIL_KEY, record);
}

export type Inventory = Record<string, number>;

export async function getInventory(
  guildId: string,
  userId: string,
): Promise<Inventory> {
  const inventory = await get<Inventory>(guildId, userId, INVENTORY_KEY);
  return inventory ?? {};
}

export async function addInventory(
  guildId: string,
  userId: string,
  name: string,
  delta: number,
): Promise<Inventory> {
  const key = name.toLowerCase();
  const inventory = { ...(await getInventory(guildId, userId)) };
  const count = (inventory[key] ?? 0) + delta;
  if (count <= 0) delete inventory[key];
  else inventory[key] = count;
  await set(guildId, userId, INVENTORY_KEY, inventory);
  return inventory;
}

export async function getSold(
  guildId: string,
  name: string,
): Promise<number> {
  return (await get<number>(guildId, SHOP_SCOPE, stockKey(name))) ?? 0;
}

export async function addSold(
  guildId: string,
  name: string,
  delta: number,
): Promise<number> {
  return incr(guildId, SHOP_SCOPE, stockKey(name), delta);
}

const stateKey = (key: string): string => `pending:${key}`;

export async function savePending<T>(
  guildId: string,
  userId: string,
  key: string,
  state: T,
  _ttlSeconds: number,
): Promise<void> {
  await set(guildId, userId, stateKey(key), state);
}

export async function loadPending<T>(
  guildId: string,
  userId: string,
  key: string,
): Promise<T | null> {
  return get<T>(guildId, userId, stateKey(key));
}

export async function clearPending(
  guildId: string,
  userId: string,
  key: string,
): Promise<void> {
  await remove(guildId, userId, stateKey(key));
}
