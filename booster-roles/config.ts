import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";

export const ModuleName = "booster-roles";
export const ConfigKey = "booster-roles-config";
export const PermitNode = "roles.boosterroles";

export const ConfigSchema = z.object({
  qualifyingRoleIds: z.array(z.string()).default([]),
  anchorRoleId: z.string().nullable().default(null),
  showcaseChannelId: z.string().nullable().default(null),
  logChannelId: z.string().nullable().default(null),
  maxShares: z.number().int().min(0).max(25).default(3),
  graceHours: z.number().int().min(0).max(720).default(24),
  maxNameLength: z.number().int().min(2).max(100).default(32),
});

export type Config = z.infer<typeof ConfigSchema>;

export function moduleNameOf(services: ModuleServices): string {
  return services.moduleName ?? ModuleName;
}

export async function getConfig(
  services: ModuleServices,
  guildId: string,
): Promise<Config> {
  let stored: unknown = null;
  try {
    stored = await services.moduleConfig.read(
      guildId,
      moduleNameOf(services),
      ConfigKey,
    );
  } catch (error) {
    services.observability?.logger?.warn?.("booster role config read failed", {
      guildId,
      error,
    });
  }

  const parsed = ConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "invalid booster role config, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return ConfigSchema.parse({});
}
