import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";

export const ModuleName = "rolementions";
export const ConfigKey = "rolementions-config";

export const ConfigSchema = z.object({
  logChannelId: z.string().nullable().default(null),
  protectedRoleIds: z.array(z.string()).default([]),
  autoBlockMinutes: z.number().int().min(1).max(43200).default(60),
  analyticsEnabled: z.boolean().default(true),
});

export type RoleMentionsConfig = z.infer<typeof ConfigSchema>;

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