import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import { moduleNameOf } from "./config.js";

export const RoleKey = "role";
export const UserRolesKey = "roles";
export const BlacklistKey = "blacklist";
const RoleListPrefix = "role";
const RoleCacheTtlMs = 30_000;

const RoleRecordSchema = z.object({
  roleId: z.string(),
  ownerId: z.string(),
  shares: z.array(z.string()),
  pendingRemovals: z.array(z.string()).default([]),
  createdAt: z.number(),
  graceUntil: z.number().nullable(),
});

const UserRoleIndexSchema = z.object({
  owned: z.array(z.string()).default([]),
  shared: z.array(z.string()).default([]),
});

const BlacklistRecordSchema = z.object({
  at: z.number(),
  by: z.string(),
  reason: z.string().optional(),
});

export type RoleRecord = z.infer<typeof RoleRecordSchema>;
export type UserRoleIndex = z.infer<typeof UserRoleIndexSchema>;
export type BlacklistRecord = z.infer<typeof BlacklistRecordSchema>;

function roleCacheKey(guildId: string, roleId: string): string {
  return `booster-roles:role:${guildId}:${roleId}`;
}

function ownerCacheKey(guildId: string, ownerId: string): string {
  return `booster-roles:owner:${guildId}:${ownerId}`;
}

async function cacheGet<T>(
  services: ModuleServices,
  key: string,
): Promise<T | null> {
  try {
    return await services.helpers.cache.get<T>(key);
  } catch {
    return null;
  }
}

async function cacheSet(
  services: ModuleServices,
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> {
  try {
    await services.helpers.cache.set(key, value, ttlMs);
  } catch {
    return;
  }
}

async function cacheDel(
  services: ModuleServices,
  key: string,
): Promise<void> {
  try {
    await services.helpers.cache.del(key);
  } catch {
    return;
  }
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export async function getRoleById(
  services: ModuleServices,
  guildId: string,
  roleId: string,
): Promise<RoleRecord | null> {
  const cached = await cacheGet<RoleRecord>(
    services,
    roleCacheKey(guildId, roleId),
  );
  if (cached) return cached;

  const stored = await services.helpers.moduleData.get<unknown>(
    guildId,
    moduleNameOf(services),
    roleId,
    RoleKey,
  );
  const parsed = RoleRecordSchema.safeParse(stored);
  if (!parsed.success) return null;

  await cacheSet(
    services,
    roleCacheKey(guildId, roleId),
    parsed.data,
    RoleCacheTtlMs,
  );
  return parsed.data;
}

export async function getRoleByOwner(
  services: ModuleServices,
  guildId: string,
  ownerId: string,
): Promise<RoleRecord | null> {
  const cachedId = await cacheGet<string>(
    services,
    ownerCacheKey(guildId, ownerId),
  );
  if (cachedId) {
    const cachedRecord = await getRoleById(services, guildId, cachedId);
    if (cachedRecord?.ownerId === ownerId) return cachedRecord;
    await cacheDel(services, ownerCacheKey(guildId, ownerId));
  }

  const index = await getUserRoleIndex(services, guildId, ownerId);
  for (const roleId of index.owned) {
    const record = await getRoleById(services, guildId, roleId);
    if (!record || record.ownerId !== ownerId) {
      await removeOwnedRole(services, guildId, ownerId, roleId);
      continue;
    }
    await cacheSet(
      services,
      ownerCacheKey(guildId, ownerId),
      record.roleId,
      RoleCacheTtlMs,
    );
    return record;
  }
  return null;
}

export async function setRoleRecord(
  services: ModuleServices,
  guildId: string,
  record: RoleRecord,
): Promise<void> {
  await services.helpers.moduleData.set(
    guildId,
    moduleNameOf(services),
    record.roleId,
    RoleKey,
    record,
  );
  await cacheSet(
    services,
    roleCacheKey(guildId, record.roleId),
    record,
    RoleCacheTtlMs,
  );
  await cacheSet(
    services,
    ownerCacheKey(guildId, record.ownerId),
    record.roleId,
    RoleCacheTtlMs,
  );
}

export async function deleteRoleRecord(
  services: ModuleServices,
  guildId: string,
  record: RoleRecord,
): Promise<number> {
  const deleted = await services.helpers.moduleData.delete(
    guildId,
    moduleNameOf(services),
    record.roleId,
    RoleKey,
  );
  await cacheDel(services, roleCacheKey(guildId, record.roleId));
  await cacheDel(services, ownerCacheKey(guildId, record.ownerId));
  return deleted;
}

export async function listRoleRecords(
  services: ModuleServices,
  guildId: string,
): Promise<RoleRecord[]> {
  const rows = await services.helpers.moduleData.list<unknown>({
    guildId,
    moduleName: moduleNameOf(services),
    prefix: RoleListPrefix,
    limit: 5_000,
  });

  const records: RoleRecord[] = [];
  for (const row of rows) {
    if (row.key !== RoleKey) continue;
    const parsed = RoleRecordSchema.safeParse(row.value);
    if (parsed.success) records.push(parsed.data);
  }
  return records;
}

export async function getUserRoleIndex(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<UserRoleIndex> {
  const stored = await services.helpers.moduleData.get<unknown>(
    guildId,
    moduleNameOf(services),
    userId,
    UserRolesKey,
  );
  const parsed = UserRoleIndexSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : { owned: [], shared: [] };
}

export async function saveUserRoleIndex(
  services: ModuleServices,
  guildId: string,
  userId: string,
  index: UserRoleIndex,
): Promise<void> {
  const next = {
    owned: uniqueIds(index.owned),
    shared: uniqueIds(index.shared),
  };
  if (next.owned.length === 0 && next.shared.length === 0) {
    await services.helpers.moduleData.delete(
      guildId,
      moduleNameOf(services),
      userId,
      UserRolesKey,
    );
    return;
  }
  await services.helpers.moduleData.set(
    guildId,
    moduleNameOf(services),
    userId,
    UserRolesKey,
    next,
  );
}

export async function addOwnedRole(
  services: ModuleServices,
  guildId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  const index = await getUserRoleIndex(services, guildId, userId);
  if (!index.owned.includes(roleId)) index.owned.push(roleId);
  await saveUserRoleIndex(services, guildId, userId, index);
}

export async function removeOwnedRole(
  services: ModuleServices,
  guildId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  const index = await getUserRoleIndex(services, guildId, userId);
  index.owned = index.owned.filter((id) => id !== roleId);
  await saveUserRoleIndex(services, guildId, userId, index);
}

export async function addSharedRole(
  services: ModuleServices,
  guildId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  const index = await getUserRoleIndex(services, guildId, userId);
  if (!index.shared.includes(roleId)) index.shared.push(roleId);
  await saveUserRoleIndex(services, guildId, userId, index);
}

export async function removeSharedRole(
  services: ModuleServices,
  guildId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  const index = await getUserRoleIndex(services, guildId, userId);
  index.shared = index.shared.filter((id) => id !== roleId);
  await saveUserRoleIndex(services, guildId, userId, index);
}

export async function getBlacklistRecord(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<BlacklistRecord | null> {
  const stored = await services.helpers.moduleData.get<unknown>(
    guildId,
    moduleNameOf(services),
    userId,
    BlacklistKey,
  );
  const parsed = BlacklistRecordSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

export async function isBlacklisted(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<boolean> {
  return (await getBlacklistRecord(services, guildId, userId)) !== null;
}

export async function addBlacklist(
  services: ModuleServices,
  guildId: string,
  userId: string,
  by: string,
  reason?: string,
): Promise<void> {
  const record: BlacklistRecord = reason
    ? { at: Date.now(), by, reason }
    : { at: Date.now(), by };
  await services.helpers.moduleData.set(
    guildId,
    moduleNameOf(services),
    userId,
    BlacklistKey,
    record,
  );
}

export async function removeBlacklist(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  return services.helpers.moduleData.delete(
    guildId,
    moduleNameOf(services),
    userId,
    BlacklistKey,
  );
}

export interface ListedBlacklistRecord {
  userId: string;
  record: BlacklistRecord;
}

export async function listBlacklist(
  services: ModuleServices,
  guildId: string,
): Promise<ListedBlacklistRecord[]> {
  const rows = await services.helpers.moduleData.list<unknown>({
    guildId,
    moduleName: moduleNameOf(services),
    key: BlacklistKey,
    limit: 5_000,
  });
  const records: ListedBlacklistRecord[] = [];
  for (const row of rows) {
    const parsed = BlacklistRecordSchema.safeParse(row.value);
    if (parsed.success) {
      records.push({ userId: row.targetId, record: parsed.data });
    }
  }
  return records;
}
