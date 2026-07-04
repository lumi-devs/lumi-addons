import { ApplyOptions } from "@sapphire/decorators";
import type { Subcommand } from "@sapphire/plugin-subcommands";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle, type ChatInputCommandInteraction } from "discord.js";
import { roleMention } from "@discordjs/formatters";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { makeInfoCard } from "#utilities/cards.js";
import { getPromoterConfig, getStats } from "../lib/evaluate.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "promoter",
  description: "Promoter-role tools.",
  permissionLevel: PermissionLevel.MOD,
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "panel", chatInputRun: "chatInputPanel" },
    { name: "stats", chatInputRun: "chatInputStats" },
  ],
})
export class PromoterCommand extends BaseSubcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("panel")
            .setDescription("Post the persistent promoter info panel here"),
        )
        .addSubcommand((sub) =>
          sub.setName("stats").setDescription("Show grant/revoke totals"),
        ),
    );
  }

  public async chatInputPanel(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    // Panel posting changes the channel for everyone — gate at ADMIN.
    await this.checkPermission(interaction, PermissionLevel.ADMIN);
    const cfg = await getPromoterConfig(interaction.guildId);
    if (!cfg.roleId || cfg.matchTerms.length === 0) {
      return this.replyError(
        interaction,
        "Not Configured",
        "Set `promoter_role_id` and `match_terms` in `/config` first.",
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
      `Put our invite or tag in your **custom status** and receive ${roleMention(cfg.roleId)} automatically. Remove it and the role goes away.\n\nAlready did it? Hit the button to be checked right now.`,
      { actionRows: [row] },
    );
    await interaction.channel?.send(card);
    return this.replySuccess(
      interaction,
      "Panel Posted",
      "The promoter panel is live.",
    );
  }

  public async chatInputStats(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const stats = await getStats(interaction.guildId);
    return this.replyInfo(
      interaction,
      "Promoter Stats",
      `**${stats.granted}** roles granted · **${stats.revoked}** roles revoked (all-time).`,
    );
  }
}
