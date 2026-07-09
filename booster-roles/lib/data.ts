import { container } from "@sapphire/framework";
import { AsyncQueue } from "@sapphire/async-queue";
import {
  MODULE_NAME,
  ROLE_KEY,
  BLACKLIST_KEY,
  type RoleRecord,
  type BlacklistRecord,
} from "../keys.js";

const kv = () => container.db.guildKV;

// Serialize record mutations per guild so concurrent share/unshare/create calls
// don't clobber each other's `sharedWith` array. KV is Postgres-backed.
const queues = new Map<string, AsyncQueue>();
const queueFor = (guildId: string): AsyncQueue => {
  let q = queues.get(guildId);
  if (!q) queues.set(guildId, (q = new AsyncQueue()));
  return q;
};

async function withGuildLock<T>(
  guildId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const q = queueFor(guildId);
  await q.wait();
  try {
    return await fn();
  } finally {
    q.shift();
  }
}

// ── Role records ─────────────────────────────────────────────────────────────

export function getRole(
  guildId: string,
  ownerId: string,
): Promise<RoleRecord | null> {
  return kv().getModuleData<RoleRecord>(
    guildId,
    MODULE_NAME,
    ownerId,
    ROLE_KEY,
  );
}

export async function setRole(
  guildId: string,
  record: RoleRecord,
): Promise<void> {
  await kv().setModuleData(
    guildId,
    MODULE_NAME,
    record.ownerId,
    ROLE_KEY,
    record,
  );
}

export async function deleteRole(
  guildId: string,
  ownerId: string,
): Promise<void> {
  await kv().deleteModuleData(guildId, MODULE_NAME, ownerId, ROLE_KEY);
}

export async function listRoles(guildId: string): Promise<RoleRecord[]> {
  const rows = await kv().listModuleData<RoleRecord>({
    module: MODULE_NAME,
    key: ROLE_KEY,
    guildId,
  });
  return rows.map((r) => r.value);
}

/** Add a share under the guild lock; returns the updated record or a reason. */
export async function addShare(
  guildId: string,
  ownerId: string,
  targetId: string,
  maxShares: number,
): Promise<{ ok: true; record: RoleRecord } | { ok: false; reason: string }> {
  return withGuildLock(guildId, async () => {
    const record = await getRole(guildId, ownerId);
    if (!record)
      return { ok: false as const, reason: "You don't have a role." };
    if (targetId === ownerId)
      return { ok: false as const, reason: "You already own this role." };
    if (record.sharedWith.includes(targetId))
      return { ok: false as const, reason: "They already have this role." };
    if (record.sharedWith.length >= maxShares)
      return {
        ok: false as const,
        reason: `You can share with at most ${maxShares} member(s).`,
      };
    record.sharedWith.push(targetId);
    await setRole(guildId, record);
    return { ok: true as const, record };
  });
}

/** Remove a share under the guild lock; returns whether anything changed. */
export async function removeShare(
  guildId: string,
  ownerId: string,
  targetId: string,
): Promise<boolean> {
  return withGuildLock(guildId, async () => {
    const record = await getRole(guildId, ownerId);
    if (!record) return false;
    const next = record.sharedWith.filter((id) => id !== targetId);
    if (next.length === record.sharedWith.length) return false;
    record.sharedWith = next;
    await setRole(guildId, record);
    return true;
  });
}

// ── Blacklist ────────────────────────────────────────────────────────────────

export async function addBlacklist(
  guildId: string,
  userId: string,
  by: string,
  reason?: string,
): Promise<void> {
  await kv().setModuleData<BlacklistRecord>(
    guildId,
    MODULE_NAME,
    userId,
    BLACKLIST_KEY,
    { at: Date.now(), by, reason },
  );
}

export async function removeBlacklist(
  guildId: string,
  userId: string,
): Promise<number> {
  return kv().deleteModuleData(guildId, MODULE_NAME, userId, BLACKLIST_KEY);
}

export async function isBlacklisted(
  guildId: string,
  userId: string,
): Promise<boolean> {
  return (
    (await kv().getModuleData<BlacklistRecord>(
      guildId,
      MODULE_NAME,
      userId,
      BLACKLIST_KEY,
    )) !== null
  );
}

export async function listBlacklist(
  guildId: string,
): Promise<{ userId: string; record: BlacklistRecord }[]> {
  const rows = await kv().listModuleData<BlacklistRecord>({
    module: MODULE_NAME,
    key: BLACKLIST_KEY,
    guildId,
  });
  return rows.map((r) => ({ userId: r.targetId, record: r.value }));
}

// ── GDPR ─────────────────────────────────────────────────────────────────────

/**
 * Erase a user's stored booster-roles data in one guild: their own role record,
 * their blacklist entry, and their id from every other owner's `sharedWith`.
 * (Deleting the actual Discord role is left to the module's delete flow / the
 * reconcile sweep — this removes stored personal data only.)
 */
export async function deleteForUser(
  guildId: string,
  userId: string,
): Promise<void> {
  await deleteRole(guildId, userId);
  await removeBlacklist(guildId, userId);
  await withGuildLock(guildId, async () => {
    const all = await listRoles(guildId);
    for (const record of all) {
      if (!record.sharedWith.includes(userId)) continue;
      record.sharedWith = record.sharedWith.filter((id) => id !== userId);
      await setRole(guildId, record);
    }
  });
}
