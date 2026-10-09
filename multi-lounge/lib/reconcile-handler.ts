import { logger } from "lumi";
import { modules } from "lumi/discord";
import { schedule } from "lumi/scheduling";
import { MODULE_NAME, RECONCILE_INTERVAL_MS, RECONCILE_TASK } from "../keys.js";
import { reconcileGuild } from "./manage.js";

export async function handleLoungeReconcileFire(
  payload: Record<string, unknown>,
): Promise<void> {
  const guildId = typeof payload.guildId === "string" ? payload.guildId : null;
  if (!guildId) return;

  try {
    const states = await modules.enabled(guildId, [MODULE_NAME]);
    if (!states[MODULE_NAME]) return;

    const remaining = await reconcileGuild(guildId);
    if (remaining > 0) {
      await schedule(
        RECONCILE_TASK,
        { guildId },
        { delay: RECONCILE_INTERVAL_MS },
      ).catch(() => null);
    }
  } catch (err: unknown) {
    logger.warn(`[multi-lounge] reconcile failed for ${guildId}: ${String(err)}`);
  }
}
