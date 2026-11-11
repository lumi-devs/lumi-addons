import type {
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
} from "@lumi/ui";
import type { ButtonInteraction } from "discord.js";
import { ModuleName } from "../config.js";
import {
  getRoleDailyCounts,
  getTodayCounts,
} from "../data.js";
import {
  buildRoleStatsCard,
  buildTopStatsCard,
} from "../ui.js";

export const statsPaginationListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(
    interaction: ButtonInteraction,
    services: ModuleServices,
  ) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(`${ModuleName}:stats:`)) return;

    const parts = interaction.customId.split(":");
    const [, scope, userId, mode, ...rest] = parts;
    if (scope !== "stats" || !userId) return;

    if (interaction.user.id !== userId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Panel",
            "Run `/rolementions stats` to open your own stats.",
          ),
        ),
      );
      return;
    }

    const action = rest[rest.length - 2];
    const pageRaw = rest[rest.length - 1];
    if (action !== "prev" && action !== "next") return;

    const guildId = interaction.guildId;
    if (!guildId) return;
    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "Role Mentions is disabled on this server.",
          ),
        ),
      );
      return;
    }

    const guild =
      interaction.guild ??
      services.client.guilds.cache.get(guildId) ??
      null;
    if (!guild) return;

    const parsed = Number.parseInt(pageRaw ?? "0", 10);
    const page = Number.isFinite(parsed) ? parsed : 0;

    await interaction.deferUpdate().catch(() => undefined);

    try {
      if (mode === "top") {
        const counts = await getTodayCounts(services, guildId);
        const entries = [...counts.entries()]
          .map(([roleId, count]) => ({
            roleId,
            roleName: guild.roles.cache.get(roleId)?.name ?? null,
            count,
          }))
          .sort(
            (a, b) =>
              b.count - a.count || a.roleId.localeCompare(b.roleId),
          );
        const totalMentions = entries.reduce(
          (sum, entry) => sum + entry.count,
          0,
        );
        await interaction.editReply(
          buildTopStatsCard({
            guildName: guild.name,
            userId,
            page,
            entries,
            totalMentions,
          }),
        );
        return;
      }

      if (mode === "role") {
        const roleId = rest[0];
        if (!roleId) {
          await interaction.editReply(
            makeErrorCard(
              "Stats Failed",
              "That role view is no longer available.",
            ),
          );
          return;
        }
        const role = guild.roles.cache.get(roleId) ?? null;
        const entries = await getRoleDailyCounts(
          services,
          guildId,
          roleId,
        );
        await interaction.editReply(
          buildRoleStatsCard({
            guildName: guild.name,
            userId,
            page,
            roleId,
            roleName: role?.name ?? null,
            entries,
          }),
        );
        return;
      }

      await interaction.editReply(
        makeErrorCard(
          "Stats Failed",
          "That stats view is not supported.",
        ),
      );
    } catch (error) {
      services.observability?.logger?.warn?.(
        "role mention stats pagination failed",
        { guildId, error },
      );
      await interaction
        .editReply(
          makeErrorCard(
            "Stats Failed",
            "Could not load the requested page.",
          ),
        )
        .catch(() => undefined);
    }
  },
};