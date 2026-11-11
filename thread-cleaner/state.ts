import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import { ModuleName, StateKey } from "./constants.js";

export const ThreadStateSchema = z.object({
  parentId: z.string().min(1),
  dueAt: z.number().finite(),
  action: z.enum(["archive", "lock"]),
  createdAt: z.number().finite(),
});

export type ThreadState = z.infer<typeof ThreadStateSchema>;

export async function readThreadState(
  services: ModuleServices,
  guildId: string,
  threadId: string,
): Promise<ThreadState | null> {
  try {
    const stored = await services.helpers.moduleData.get<unknown>(
      guildId,
      ModuleName,
      threadId,
      StateKey,
    );
    const parsed = ThreadStateSchema.safeParse(stored);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    services.observability.logger.warn("thread-cleaner state read failed", {
      guildId,
      threadId,
      error,
    });
    return null;
  }
}

export async function deleteThreadState(
  services: ModuleServices,
  guildId: string,
  threadId: string,
): Promise<void> {
  await services.helpers.moduleData
    .delete(guildId, ModuleName, threadId, StateKey)
    .catch(() => undefined);
}
