import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import {
  ActivityTypeNames,
  type ActivityRule,
  type ActivityTypeName,
} from "./logic.js";

export const ModuleName = "activity-roles";

const RuleTargetId = "_";
const RulePrefix = "rule:";
const GrantedKey = "granted";
const RuleCacheTtlMs = 30_000;
const RuleQueryLimit = 5_000;

const ActivityRuleSchema = z.object({
  type: z.enum(ActivityTypeNames),
  match: z.string().min(1),
  roleId: z.string().min(1),
});

const GrantedSchema = z.object({
  roleIds: z.array(z.string()),
});

interface RuleCacheEntry {
  expiresAt: number;
  rules: ActivityRule[];
}

const ruleCache = new Map<string, RuleCacheEntry>();

export function invalidateRuleCache(guildId?: string): void {
  if (guildId === undefined) {
    ruleCache.clear();
    return;
  }
  ruleCache.delete(guildId);
}

function ruleKey(type: ActivityTypeName, match: string): string {
  return `${RulePrefix}${type.toLowerCase()}:${match.trim().toLowerCase()}`;
}

export async function listRules(
  services: ModuleServices,
  guildId: string,
): Promise<ActivityRule[]> {
  const cached = ruleCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.rules;
  const entries = await services.helpers.moduleData.list<unknown>({
    guildId,
    moduleName: ModuleName,
    targetId: RuleTargetId,
    prefix: RulePrefix,
    limit: RuleQueryLimit,
  });
  const rules: ActivityRule[] = [];
  for (const entry of entries) {
    const parsed = ActivityRuleSchema.safeParse(entry.value);
    if (parsed.success) rules.push(parsed.data);
  }
  rules.sort(
    (left, right) =>
      left.type.localeCompare(right.type) ||
      left.match.localeCompare(right.match),
  );
  ruleCache.set(guildId, { expiresAt: Date.now() + RuleCacheTtlMs, rules });
  return rules;
}

export async function upsertRule(
  services: ModuleServices,
  guildId: string,
  rule: ActivityRule,
): Promise<void> {
  const match = rule.match.trim();
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    RuleTargetId,
    ruleKey(rule.type, match),
    {
      type: rule.type,
      match,
      roleId: rule.roleId,
    },
  );
  invalidateRuleCache(guildId);
}

export async function deleteRule(
  services: ModuleServices,
  guildId: string,
  type: ActivityTypeName,
  match: string,
): Promise<boolean> {
  const deleted = await services.helpers.moduleData.delete(
    guildId,
    ModuleName,
    RuleTargetId,
    ruleKey(type, match),
  );
  if (deleted > 0) invalidateRuleCache(guildId);
  return deleted > 0;
}

export async function getGranted(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<string[]> {
  const raw = await services.helpers.moduleData.get<unknown>(
    guildId,
    ModuleName,
    userId,
    GrantedKey,
  );
  if (raw === null) return [];
  const parsed = GrantedSchema.safeParse(raw);
  if (!parsed.success) {
    await services.helpers.moduleData
      .delete(guildId, ModuleName, userId, GrantedKey)
      .catch(() => 0);
    return [];
  }
  return [...new Set(parsed.data.roleIds)];
}

export async function setGranted(
  services: ModuleServices,
  guildId: string,
  userId: string,
  roleIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(roleIds)];
  if (unique.length === 0) {
    await services.helpers.moduleData.delete(
      guildId,
      ModuleName,
      userId,
      GrantedKey,
    );
    return;
  }
  await services.helpers.moduleData.set(
    guildId,
    ModuleName,
    userId,
    GrantedKey,
    { roleIds: unique },
  );
}

export async function clearGranted(
  services: ModuleServices,
  guildId: string,
  userId: string,
): Promise<number> {
  return services.helpers.moduleData.deleteTarget(
    guildId,
    ModuleName,
    userId,
  );
}

export async function listGrantedTargets(
  services: ModuleServices,
  guildId: string,
): Promise<string[]> {
  const entries = await services.helpers.moduleData.list<unknown>({
    guildId,
    moduleName: ModuleName,
    key: GrantedKey,
    limit: 5_000,
  });
  return [...new Set(entries.map((entry) => entry.targetId))];
}
