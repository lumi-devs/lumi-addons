import type { TaskDefinition } from "@lumi/module-kit";
import {
  type DragRequest,
  ModuleName,
  PendingKey,
  savePendingRequest,
  SweepGraceMs,
} from "../data.js";
import { editRequestCard, expiredCard } from "../ui.js";

export const expireSweepTask: TaskDefinition = {
  name: "expire-sweep",
  cron: "*/2 * * * *",
  timezone: "UTC",
  async handler(services) {
    const rows = await services.helpers.moduleData.list<DragRequest>({
      moduleName: ModuleName,
      key: PendingKey,
      limit: 5_000,
    });
    const now = Date.now();

    for (const row of rows) {
      const request = row.value;
      if (!request || request.expiresAt > now) continue;

      try {
        const claimed = await services.helpers.moduleData.take<DragRequest>(
          row.guildId,
          ModuleName,
          request.requesterId,
          PendingKey,
        );
        if (!claimed) continue;
        if (claimed.expiresAt > now) {
          await savePendingRequest(
            services,
            claimed,
            claimed.expiresAt - now + SweepGraceMs,
          );
          continue;
        }
        await editRequestCard(services, claimed, expiredCard(claimed));
      } catch (error) {
        services.observability.logger.warn("dragme expiry sweep failed", {
          guildId: row.guildId,
          error,
        });
      }
    }
  },
};
