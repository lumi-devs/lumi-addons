import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import type { OneshotContext } from "@lumi-devs/lumi/lib/scheduler/Oneshot.js";
import { scheduleOneshot } from "@lumi-devs/lumi/lib/scheduler/Oneshot.js";
import {
  MODULE_NAME,
  RECONCILE_INTERVAL_MS,
  RECONCILE_TASK,
} from "../utilities/Keys.js";
import { reconcileGuild } from "../utilities/Manage.js";

export async function handleReconcileFire(
  services: Container,
  ctx: OneshotContext,
): Promise<void> {
  const guildId = ctx.guildId;
  if (!guildId) return;

  try {
    const isEnabled = await services.db.modules.isModuleEnabled(
      guildId,
      MODULE_NAME,
    );
    if (!isEnabled) return;

    const remaining = await reconcileGuild(services, guildId);
    if (remaining > 0) {
      await scheduleOneshot(
        services,
        MODULE_NAME,
        RECONCILE_TASK,
        guildId,
        RECONCILE_INTERVAL_MS,
        { guildId },
      ).catch(() => null);
    }
  } catch (err: unknown) {
    services.logger.warn(
      `[multi-lounge] reconcile failed for ${guildId}: ${String(err)}`,
    );
  }
}

export const oneshots = {
  [RECONCILE_TASK]: handleReconcileFire,
};
