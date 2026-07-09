import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";
import { ephemeralCard, makeWarningCard } from "#utilities/cards.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "thread-cleaner",
  description: "Bulk-manage this server's threads.",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
  subcommands: [{ name: "sweep", chatInputRun: "chatInputRunSweep" }],
})
export class ThreadCleanerCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("sweep")
            .setDescription(
              "Delete empty / small existing threads, and optionally thin the rest.",
            )
            .addIntegerOption((o) =>
              o
                .setName("min_messages")
                .setDescription(
                  "Delete threads with this many messages or fewer (default 1).",
                )
                .setMinValue(0)
                .setMaxValue(50),
            )
            .addStringOption((o) =>
              o
                .setName("scope")
                .setDescription(
                  "Which threads to sweep (default: enabled channels).",
                )
                .addChoices(
                  { name: "Enabled channels only", value: "enabled" },
                  { name: "All channels", value: "all" },
                ),
            )
            .addBooleanOption((o) =>
              o
                .setName("strip_members")
                .setDescription(
                  "Also remove added members from the threads that are kept.",
                ),
            ),
        ),
    );
  }

  public async chatInputRunSweep(interaction: ChatInputCommandInteraction) {
    const minMessages = interaction.options.getInteger("min_messages") ?? 1;
    const scope =
      (interaction.options.getString("scope") as "all" | "enabled" | null) ??
      "enabled";
    const strip = interaction.options.getBoolean("strip_members") ?? false;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`tc:sweep:go:${minMessages}:${scope}:${strip ? 1 : 0}`)
        .setLabel("Run Sweep")
        .setEmoji({ name: "🧹" })
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("tc:sweep:x")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    );

    const summary = [
      `This will scan **${scope === "all" ? "all channels" : "enabled channels only"}** and:`,
      `• **delete** every thread with **≤ ${minMessages}** message(s) — this is permanent`,
      strip
        ? "• **remove all added members** from the threads that survive"
        : "• keep the rest untouched",
      "",
      "Deleted threads cannot be recovered. Proceed?",
    ];

    return this.reply(
      interaction,
      ephemeralCard(
        makeWarningCard("⚠️ Confirm Thread Sweep", summary, {
          actionRows: [row],
        }),
      ),
    );
  }
}
