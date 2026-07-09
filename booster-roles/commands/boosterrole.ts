import { ApplyOptions } from "@sapphire/decorators";
import type { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { ephemeralCard, makeWarningCard } from "#utilities/cards.js";
import { getBoosterConfig } from "../lib/config.js";
import { getRole, isBlacklisted } from "../lib/data.js";
import { isEligible } from "../lib/roles.js";
import { buildPanel } from "../lib/ui.js";

@ApplyOptions<BaseCommand.Options>({
  name: "boosterrole",
  description: "Create and manage your personal booster role.",
  preconditions: ["GuildOnly"],
})
export class BoosterRoleCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const member = await interaction
      .guild!.members.fetch(interaction.user.id)
      .catch(() => null);
    if (!member)
      return this.replyError(
        interaction,
        "Error",
        "Couldn't resolve your membership.",
      );

    const config = await getBoosterConfig(member.guild.id);
    const record = await getRole(member.guild.id, member.id);

    // Blacklisted members are locked out entirely.
    if (await isBlacklisted(member.guild.id, member.id))
      return this.reply(
        interaction,
        ephemeralCard(
          makeWarningCard(
            "Blocked",
            "You're blacklisted from using custom roles here.",
          ),
        ),
      );

    // Non-boosters with no existing role can't do anything useful.
    if (!record && !isEligible(member, config))
      return this.reply(
        interaction,
        ephemeralCard(
          makeWarningCard(
            "Boosters Only",
            "You need to be a server booster to create a custom role. Thanks for considering it!",
          ),
        ),
      );

    return this.reply(interaction, ephemeralCard(buildPanel(record)));
  }
}
