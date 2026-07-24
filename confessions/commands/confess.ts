import { ApplyOptions } from "@sapphire/decorators";
import type { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeWarningCard,
} from "#utilities/cards.js";
import { getConfessionsConfig } from "../lib/config.js";
import { authorHashFor, isBanned, onCooldown } from "../lib/data.js";
import { buildConfessionModal } from "../lib/ui.js";

@ApplyOptions<BaseCommand.Options>({
  name: "confess",
  description: "Submit an anonymous confession.",
  preconditions: ["GuildOnly"],
  cooldownLimit: 2,
  cooldownDelay: 5000,
})
export class ConfessCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const config = await getConfessionsConfig(guildId);

    if (!config.channelId)
      return interaction.reply(
        ephemeralCard(
          makeWarningCard(
            "Not Configured",
            "An admin needs to set the confession channel in `/lumi` → **Modules** → **Confessions**.",
          ),
        ),
      );

    const hash = await authorHashFor(guildId, interaction.user.id);
    if (await isBanned(guildId, hash))
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Blocked",
            "You can no longer submit confessions in this server.",
          ),
        ),
      );

    if (await onCooldown(guildId, hash))
      return interaction.reply(
        ephemeralCard(
          makeWarningCard(
            "Slow Down",
            `Please wait before your next confession (cooldown: ${config.cooldownMinutes}m).`,
          ),
        ),
      );

    return interaction.showModal(buildConfessionModal(config.allowAttachments));
  }
}
