import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import type { CommandDef } from "@lumi-devs/lumi/lib/commands/CommandDef.js";
import type { CommandContext } from "@lumi-devs/lumi/lib/commands/Context.js";
import { makeInfoCard, ephemeralCard, makeErrorCard } from "@lumi-devs/lumi/lib/ui/Cards.js";
import { getPromoterConfig, getStats } from "../Index.js";

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
        sub.setName("panel").setDescription("Post the persistent promoter info panel here"),
      )
      .addSubcommand((sub) =>
        sub.setName("stats").setDescription("Show grant/revoke totals"),
      ) as SlashCommandBuilder;
  },
  handlers: {
    panel: {
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

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("promoter:check")
            .setLabel("Check my status")
            .setStyle(ButtonStyle.Primary),
        );

        const card = makeInfoCard(
          "Promote the Server, Get the Role",
          `Put our invite or tag in your **custom status** and receive <@&${config.roleId}> automatically. Remove it and the role goes away.\n\nAlready did it? Hit the button to be checked right now.`,
          { actionRows: [row] },
        );

        const channel = ctx.source.channel;
        if (!channel?.isSendable()) {
          return ctx.reply(
            ephemeralCard(makeErrorCard("Error", "Cannot send messages in this channel.")),
          );
        }
        await channel.send(card);
        return ctx.reply(
          ephemeralCard(makeErrorCard("Panel Posted", "The promoter panel is live.")),
        );
      },
    },
    stats: {
      requiredPermit: "admin.promoter",
      run: async (ctx: CommandContext) => {
        const stats = await getStats(ctx.services, ctx.guildId!);
        return ctx.replyInfo(
          "Promoter Stats",
          `**${stats.granted}** roles granted · **${stats.revoked}** roles revoked (all-time).`,
        );
      },
    },
  },
};
