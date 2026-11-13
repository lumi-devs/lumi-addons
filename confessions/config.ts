import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";

export const ModuleName = "confessions";
export const ConfigKey = "confessions-config";

export const ConfigSchema = z.object({
  confessionChannelId: z.string().min(1).nullable().default(null),
  logChannelId: z.string().min(1).nullable().default(null),
  reportChannelId: z.string().min(1).nullable().default(null),
  reportPingRoleId: z.string().min(1).nullable().default(null),
  autoThread: z.boolean().default(true),
  allowImages: z.boolean().default(true),
  replyDm: z.boolean().default(true),
  cooldownMinutes: z.number().int().min(0).max(1440).default(5),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function readConfig(
  services: ModuleServices,
  guildId: string,
): Promise<Config> {
  let stored: unknown = null;
  try {
    stored = await services.moduleConfig.read(
      guildId,
      services.moduleName ?? ModuleName,
      ConfigKey,
    );
  } catch (error) {
    services.observability?.logger?.warn?.("confessions config read failed", {
      guildId,
      error,
    });
  }

  const parsed = ConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "confessions invalid config, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return ConfigSchema.parse({});
}
