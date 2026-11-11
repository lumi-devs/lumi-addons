import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import { ConfigKey, ModuleName } from "./constants.js";

export const ConfigSchema = z.object({
  enabledChannelIds: z.array(z.string().min(1)).default([]),
  inactiveDurationMinutes: z.number().int().min(1).max(525_600).default(4_320),
  action: z.enum(["archive", "lock"]).default("archive"),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DefaultConfig: Config = ConfigSchema.parse({});

export async function getConfig(
  services: ModuleServices,
  guildId: string,
): Promise<Config> {
  let stored: unknown;
  try {
    stored = await services.moduleConfig.read(
      guildId,
      services.moduleName ?? ModuleName,
      ConfigKey,
    );
  } catch (error) {
    services.observability.logger.warn("thread-cleaner config read failed", {
      guildId,
      error,
    });
    stored = undefined;
  }

  const parsed = ConfigSchema.safeParse(stored ?? {});
  if (!parsed.success) {
    services.observability.logger.warn(
      "thread-cleaner config invalid, using defaults",
      { guildId, issues: parsed.error.issues },
    );
    return { ...DefaultConfig };
  }

  return parsed.data;
}
