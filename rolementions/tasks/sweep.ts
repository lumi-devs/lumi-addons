import type {
  ModuleServices,
  TaskDefinition,
} from "@lumi/module-kit";
import { ModuleName, readConfig } from "../config.js";
import { listBlocks } from "../data.js";
import { reconcileBlock } from "../protection.js";

export const sweepTask: TaskDefinition = {
  name: "sweep",
  cron: "* * * * *",
  async handler(services: ModuleServices) {
    for (const guild of services.client.guilds.cache.values()) {
      if (!services.modules.isEnabled(guild.id, ModuleName)) continue;

      const blocks = await listBlocks(services, guild.id).catch(
        (error: unknown) => {
          services.observability?.logger?.warn?.(
            "role mention block sweep failed",
            { guildId: guild.id, error },
          );
          return [];
        },
      );
      if (blocks.length === 0) continue;

      const config = await readConfig(services, guild.id);
      for (const block of blocks) {
        await reconcileBlock(
          services,
          guild,
          block,
          config.logChannelId,
        ).catch((error: unknown) => {
          services.observability?.logger?.warn?.(
            "role mention block reconcile failed",
            { guildId: guild.id, roleId: block.roleId, error },
          );
        });
      }
    }
  },
};