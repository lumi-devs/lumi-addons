import { SlashCommandBuilder } from "@discordjs/builders";
import type { CommandDef } from "@lumi-devs/lumi/commands";
import type { CommandContext } from "@lumi-devs/lumi/context";
import { makeInfoCard, ephemeralCard, makeErrorCard } from "@lumi-devs/lumi/ui";
import { getPromoterConfig, getStats } from "../utilities/Engine.js";

export const promoterDef: CommandDef = {
  name: "promoter",
  module: "promoter",
  description: "Promoter-role tools.",
  guildOnly: true,
  build: () => {
    return new SlashCommandBuilder()
      .setName("promoter")
      .setDescription("Promoter-role tools.")
      .addSubcommand((sub) =>
        sub.setName("stats").setDescription("Show grant/revoke totals"),
      ) as SlashCommandBuilder;
  },
  handlers: {
    stats: {
      requiredPermit: "admin.promoter",
      run: async (ctx: CommandContext) => {
        const guildId = ctx.guildId!;
        const config = await getPromoterConfig(ctx.services, guildId);
        if (!config.roleId || config.matchTerms.length === 0) {
          return ctx.reply(
            ephemeralCard(
              makeErrorCard(
                "Not Configured",
                "Set `promoter_role_id` and `match_terms` in `/config` first.",
              ),
            ),
          );
        }
        const { granted, revoked } = await getStats(ctx.services, guildId);
        return ctx.reply(
          makeInfoCard(
            "Promoter Stats",
            `Total Granted: **${granted}**\nTotal Revoked: **${revoked}**`,
          ),
        );
      },
    },
  },
};