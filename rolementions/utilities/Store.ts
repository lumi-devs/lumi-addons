import type { Container } from "@lumi-devs/lumi/services";
import {
  BLOCK_KEY,
  COUNT_KEY,
  MODULE_NAME,
  PROTECTED_KEY,
  countTarget,
  dayStamp,
  type ActiveBlock,
} from "./Keys.js";

function parseBlock(value: unknown): ActiveBlock | null {
  if (!value || typeof value !== "object") return null;
  const b = value as Partial<ActiveBlock>;
  if (typeof b.roleId !== "string" || typeof b.expiresAt !== "number") {
    return null;
  }
  return {
    roleId: b.roleId,
    roleName: typeof b.roleName === "string" ? b.roleName : undefined,
    createdAt: typeof b.createdAt === "number" ? b.createdAt : Date.now(),
    expiresAt: b.expiresAt,
    durationMinutes:
      typeof b.durationMinutes === "number" ? b.durationMinutes : 0,
    manual: b.manual === true,
  };
}

export async function incrementMentions(
  services: Container,
  guildId: string,
  roleIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (roleIds.length === 0) return counts;
  const day = dayStamp();
  for (const roleId of roleIds) {
    const value = await services.db.guildKV.incrModuleData(
      guildId,
      MODULE_NAME,
      countTarget(day, roleId),
      COUNT_KEY,
      1,
    );
    counts.set(roleId, value);
  }
  return counts;
}

export async function getCounts(
  services: Container,
  guildId: string,
): Promise<Map<string, number>> {
  const rows = await services.db.guildKV.listModuleData<number>({
    module: MODULE_NAME,
    key: COUNT_KEY,
    guildId,
  });
  const out = new Map<string, number>();
  const today = dayStamp();
  for (const row of rows) {
    const sep = row.targetId.indexOf(":");
    if (sep < 0) {
      await services.db.guildKV.deleteModuleData(
        guildId,
        MODULE_NAME,
        row.targetId,
        COUNT_KEY,
      );
      continue;
    }
    const day = row.targetId.slice(0, sep);
    const roleId = row.targetId.slice(sep + 1);
    if (day !== today) {
      await services.db.guildKV.deleteModuleData(
        guildId,
        MODULE_NAME,
        row.targetId,
        COUNT_KEY,
      );
      continue;
    }
    const n = Number(row.value);
    if (!Number.isNaN(n) && n > 0) out.set(roleId, n);
  }
  return out;
}

export async function getRoleCount(
  services: Container,
  guildId: string,
  roleId: string,
): Promise<number> {
  const raw = await services.db.guildKV.getModuleData<number>(
    guildId,
    MODULE_NAME,
    countTarget(dayStamp(), roleId),
    COUNT_KEY,
  );
  const n = Number(raw);
  return Number.isNaN(n) ? 0 : n;
}

export async function resetCounts(
  services: Container,
  guildId: string,
): Promise<void> {
  const rows = await services.db.guildKV.listModuleData<number>({
    module: MODULE_NAME,
    key: COUNT_KEY,
    guildId,
  });
  for (const row of rows) {
    await services.db.guildKV.deleteModuleData(
      guildId,
      MODULE_NAME,
      row.targetId,
      COUNT_KEY,
    );
  }
}

export async function setProtectedRole(
  services: Container,
  guildId: string,
  roleId: string,
  durationMinutes: number,
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    roleId,
    PROTECTED_KEY,
    { durationMinutes },
  );
}

export async function removeProtectedRole(
  services: Container,
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const count = await services.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    roleId,
    PROTECTED_KEY,
  );
  return count > 0;
}

export async function getProtectedRoles(
  services: Container,
  guildId: string,
): Promise<Map<string, number>> {
  const rows = await services.db.guildKV.listModuleData<{
    durationMinutes?: number;
  }>({
    module: MODULE_NAME,
    key: PROTECTED_KEY,
    guildId,
  });
  return new Map(rows.map((r) => [r.targetId, r.value?.durationMinutes ?? 0]));
}

export async function getBlocks(
  services: Container,
  guildId: string,
): Promise<Map<string, ActiveBlock>> {
  const rows = await services.db.guildKV.listModuleData<unknown>({
    module: MODULE_NAME,
    key: BLOCK_KEY,
    guildId,
  });
  const out = new Map<string, ActiveBlock>();
  const now = Date.now();
  for (const row of rows) {
    const parsed = parseBlock(row.value);
    if (!parsed) continue;
    if (parsed.expiresAt <= now) {
      await services.db.guildKV.deleteModuleData(
        guildId,
        MODULE_NAME,
        row.targetId,
        BLOCK_KEY,
      );
      continue;
    }
    out.set(row.targetId, parsed);
  }
  return out;
}

export async function getBlock(
  services: Container,
  guildId: string,
  roleId: string,
): Promise<ActiveBlock | null> {
  const raw = await services.db.guildKV.getModuleData<unknown>(
    guildId,
    MODULE_NAME,
    roleId,
    BLOCK_KEY,
  );
  const block = parseBlock(raw);
  if (!block) return null;
  if (block.expiresAt <= Date.now()) {
    await services.db.guildKV.deleteModuleData(
      guildId,
      MODULE_NAME,
      roleId,
      BLOCK_KEY,
    );
    return null;
  }
  return block;
}

export async function setBlock(
  services: Container,
  guildId: string,
  block: ActiveBlock,
): Promise<void> {
  await services.db.guildKV.setModuleData(
    guildId,
    MODULE_NAME,
    block.roleId,
    BLOCK_KEY,
    block,
  );
}

export async function removeBlock(
  services: Container,
  guildId: string,
  roleId: string,
): Promise<boolean> {
  const count = await services.db.guildKV.deleteModuleData(
    guildId,
    MODULE_NAME,
    roleId,
    BLOCK_KEY,
  );
  return count > 0;
}
