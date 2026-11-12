import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";

export const ModuleName = "rolementions";
export const ConfigKey = "rolementions-config";

export const MaxAutoBlockMinutes = 43200;

const AutoBlockMinutesSchema = z
  .number()
  .int()
  .min(1)
  .max(MaxAutoBlockMinutes);

export const ProtectedRoleSchema = z.preprocess(
  (raw) => (typeof raw === "string" ? { roleId: raw } : raw),
  z.object({
    roleId: z.string(),
    autoBlockMinutes: AutoBlockMinutesSchema.optional(),
  }),
);

export type ProtectedRole = z.infer<typeof ProtectedRoleSchema>;

export const ConfigSchema = z.object({
  logChannelId: z.string().nullable().default(null),
  protectedRoleIds: z.array(ProtectedRoleSchema).default([]),
  autoBlockMinutes: AutoBlockMinutesSchema.default(60),
  analyticsEnabled: z.boolean().default(true),
});

export type RoleMentionsConfig = z.infer<typeof ConfigSchema>;

export function findProtectedRole(
  config: RoleMentionsConfig,
  roleId: string,
): ProtectedRole | undefined {
  return config.protectedRoleIds.find((entry) => entry.roleId === roleId);
}

export function effectiveAutoBlockMinutes(
  config: RoleMentionsConfig,
  roleId: string,
): number {
  return (
    findProtectedRole(config, roleId)?.autoBlockMinutes ??
    config.autoBlockMinutes
  );
}

export async function readConfig(
  services: ModuleServices,
  guildId: string,
): Promise<RoleMentionsConfig> {
  let stored: unknown = null;
  try {
    stored = await services.moduleConfig.read(
      guildId,
      services.moduleName ?? ModuleName,
      ConfigKey,
    );
  } catch (error) {
    services.observability?.logger?.warn?.("role-mentions config read failed", {
      guildId,
      error,
    });
  }

  const parsed = ConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "role-mentions invalid config, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return ConfigSchema.parse({});
}

export async function saveConfig(
  services: ModuleServices,
  guildId: string,
  config: RoleMentionsConfig,
): Promise<boolean> {
  try {
    await services.moduleConfig.save(
      guildId,
      services.moduleName ?? ModuleName,
      ConfigKey,
      config,
    );
    return true;
  } catch (error) {
    services.observability?.logger?.warn?.("role-mentions config save failed", {
      guildId,
      error,
    });
    return false;
  }
}
