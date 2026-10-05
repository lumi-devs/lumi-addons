import { container } from "@sapphire/framework";
import {
  INVENTORY_KEY,
  JAIL_KEY,
  MODULE_NAME,
  SHOP_SCOPE,
  stockKey,
  type JailRecord,
} from "../keys.js";

const kv = () => container.db.guildKV;

export async function claimCooldown(
  key: string,
  ms: number,
): Promise<boolean> {
  if (ms <= 0) return true;
  const set = await container.valkey.set(key, "1", "PX", ms, "NX");
  return set !== null;
}

export async function getJail(
  guildId: string,
  userId: string,
): Promise<JailRecord | null> {
  return kv().getModuleData<JailRecord>(
    guildId,
    MODULE_NAME,
    userId,
    JAIL_KEY,
  );
}

export async function setJail(
  guildId: string,
  userId: string,
  record: JailRecord,
): Promise<void> {
  await kv().setModuleData(guildId, MODULE_NAME, userId, JAIL_KEY, record);
}

export async function deleteJail(
  guildId: string,
  userId: string,
): Promise<void> {
  await kv().deleteModuleData(guildId, MODULE_NAME, userId, JAIL_KEY);
}

export type Inventory = Record<string, number>;

export async function getInventory(
  guildId: string,
  userId: string,
): Promise<Inventory> {
  return (
    (await kv().getModuleData<Inventory>(
      guildId,
      MODULE_NAME,
      userId,
      INVENTORY_KEY,
    )) ?? {}
  );
}

export async function addInventory(
  guildId: string,
  userId: string,
  name: string,
  delta: number,
): Promise<Inventory> {
  const key = name.toLowerCase();
  const next = await kv().mutateModuleData<Inventory>(
    guildId,
    MODULE_NAME,
    userId,
    INVENTORY_KEY,
    (current) => {
      const inv: Inventory = { ...(current ?? {}) };
      const count = (inv[key] ?? 0) + delta;
      if (count <= 0) delete inv[key];
      else inv[key] = count;
      return inv;
    },
  );
  return next ?? {};
}

export async function deleteInventory(
  guildId: string,
  userId: string,
): Promise<void> {
  await kv().deleteModuleData(guildId, MODULE_NAME, userId, INVENTORY_KEY);
}

export async function getSold(
  guildId: string,
  name: string,
): Promise<number> {
  return (
    (await kv().getModuleData<number>(
      guildId,
      MODULE_NAME,
      SHOP_SCOPE,
      stockKey(name),
    )) ?? 0
  );
}

export async function addSold(
  guildId: string,
  name: string,
  delta: number,
): Promise<number> {
  const next = await kv().mutateModuleData<number>(
    guildId,
    MODULE_NAME,
    SHOP_SCOPE,
    stockKey(name),
    (current) => (current ?? 0) + delta,
  );
  return next ?? 0;
}

export async function savePending<T>(
  key: string,
  state: T,
  ttlSeconds: number,
): Promise<void> {
  await container.valkey.set(key, JSON.stringify(state), "EX", ttlSeconds);
}

export async function loadPending<T>(key: string): Promise<T | null> {
  const raw = await container.valkey.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearPending(key: string): Promise<void> {
  await container.valkey.del(key);
}

export async function deleteUserState(
  guildId: string,
  userId: string,
  cooldownKeys: string[],
  pendingKeys: string[],
): Promise<void> {
  await deleteJail(guildId, userId);
  await deleteInventory(guildId, userId);
  await container.valkey.del(...cooldownKeys, ...pendingKeys);
}

export async function exportUserState(
  guildId: string,
  userId: string,
): Promise<{ jail: JailRecord | null; inventory: Inventory } | null> {
  const [jail, inventory] = await Promise.all([
    getJail(guildId, userId),
    getInventory(guildId, userId),
  ]);
  if (jail === null && Object.keys(inventory).length === 0) return null;
  return { jail, inventory };
}
