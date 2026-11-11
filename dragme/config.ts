import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import { ModuleName } from "./data.js";

export const ConfigKey = "dragme-config";

export const ConfigSchema = z.object({
  requestChannelId: z.string().nullable().default(null),
  timeoutMinutes: z.coerce.number().int().min(1).max(60).default(10),
  blacklistRoleIds: z.array(z.string()).default([]),
});

export type DragmeConfig = z.infer<typeof ConfigSchema>;

export async function getConfig(
  services: ModuleServices,
  guildId: string,
): Promise<DragmeConfig> {
  let stored: unknown = null;
  try {
    stored = await services.moduleConfig.read(
      guildId,
      services.moduleName ?? ModuleName,
      ConfigKey,
    );
  } catch (error) {
    services.observability.logger.warn("dragme config read failed", {
      guildId,
      error,
    });
  }

  const parsed = ConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability.logger.warn("dragme invalid config, using defaults", {
    guildId,
    issues: parsed.error.issues,
  });
  return ConfigSchema.parse({});
}
