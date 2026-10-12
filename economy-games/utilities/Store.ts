import type { Container } from "@lumi-devs/lumi/services";
import { claimCooldown as claimValkeyCooldown } from "@lumi-devs/lumi/cooldown";
import {
  INVENTORY_KEY,
  JAIL_KEY,
  MODULE_NAME,
  SHOP_SCOPE,
  stockKey,
  type JailRecord,
} from "./Keys.js";

export async function claimCooldown(
  services: Container,
  guildId: string,
  userId: string,
  scope: string,
  ms: number,
): Promise<boolean> {
  if (ms <= 0) return true;
  return claimValkeyCooldown(services, `lumi:games:cd:${guildId}:${userId}:${scope}`, ms);
}

export async function getJail(
  services: Container,
  guildId: string,
  userId: string,
): Promise<JailRecord | null> {
  const record = await services.db.guildKV.getModuleData<JailRecord>(
    guildId,
    MODULE_NAME,
    userId,
    JAIL_KEY,
  );
  if (!record || typeof record.until !== "number") return null;
  return record;
}

export async function setJail(
  services: Container,
  guildId: string,
  userId: string,
  record: JailRecord,
): Promise<void> {
  await services.db.guildKV.setModuleData(guildId, MODULE_NAME, userId, JAIL_KEY, record);
}

export type Inventory = Record<string, number>;

export async function getInventory(
  services: Container,
  guildId: string,
  userId: string,
): Promise<Inventory> {
  const inventory = await services.db.guildKV.getModuleData<Inventory>(
    guildId,
    MODULE_NAME,
    userId,
    INVENTORY_KEY,
  );
  return inventory ?? {};
}

export async function addInventory(
  services: Container,
  guildId: string,
  userId: string,
  name: string,
  delta: number,
): Promise<Inventory> {
  const key = name.toLowerCase();
  const inventory = { ...(await getInventory(services, guildId, userId)) };
  const count = (inventory[key] ?? 0) + delta;
  if (count <= 0) delete inventory[key];
  else inventory[key] = count;
  await services.db.guildKV.setModuleData(guildId, MODULE_NAME, userId, INVENTORY_KEY, inventory);
  return inventory;
}

export async function getSold(
  services: Container,
  guildId: string,
  name: string,
): Promise<number> {
  const sold = await services.db.guildKV.getModuleData<number>(
    guildId,
    MODULE_NAME,
    SHOP_SCOPE,
    stockKey(name),
  );
  return typeof sold === "number" ? sold : 0;
}

export async function addSold(
  services: Container,
  guildId: string,
  name: string,
  delta: number,
): Promise<number> {
  return services.db.guildKV.incrModuleData(guildId, MODULE_NAME, SHOP_SCOPE, stockKey(name), delta);
}

const stateKey = (key: string): string => `pending:${key}`;

export async function savePending<T>(
  services: Container,
  guildId: string,
  userId: string,
  key: string,
  state: T,
): Promise<void> {
  await services.db.guildKV.setModuleData(guildId, MODULE_NAME, userId, stateKey(key), state, {
    ttlMs: 5 * 60 * 1000,
  });
}

export async function loadPending<T>(
  services: Container,
  guildId: string,
  userId: string,
  key: string,
): Promise<T | null> {
  return services.db.guildKV.getModuleData<T>(guildId, MODULE_NAME, userId, stateKey(key));
}

export async function clearPending(
  services: Container,
  guildId: string,
  userId: string,
  key: string,
): Promise<void> {
  await services.db.guildKV.deleteModuleData(guildId, MODULE_NAME, userId, stateKey(key));
}
