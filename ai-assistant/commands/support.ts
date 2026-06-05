import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import { ChannelType, type ChatInputCommandInteraction, type TextChannel } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";

@ApplyOptions<BaseCommand.Options>({
  name: "support",
  description: "Open an AI-powered support ticket.",
  permissionLevel: PermissionLevel.USER,
})
export class SupportCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((opt) =>
          opt
            .setName("issue")
            .setDescription("Describe your problem briefly.")
            .setRequired(true)
        )
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const issue = interaction.options.getString("issue", true);
    
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
      return this.replyError(interaction, "Error", "This command can only be used in a server text channel.");
    }

    try {
      // Try creating a public thread for the ticket
      const channel = interaction.channel as TextChannel;
      const thread = await channel.threads.create({
        name: `support-${interaction.user.username}`,
        autoArchiveDuration: 60,
        type: ChannelType.PublicThread,
        reason: "AI Support Ticket",
      });

      await thread.send(`Hello <@${interaction.user.id}>, I am your AI Support Assistant. I'm looking into your issue now...`);
      await this.replySuccess(interaction, "Ticket Created", `Head over to <#${thread.id}> for assistance!`);

      // Queue the AI request as a BullMQ background task for robust retries
      await this.container.tasks.create({
        name: "ai-request",
        payload: {
          channelId: thread.id,
          guildId: interaction.guildId!,
          question: `A user has opened a support ticket with the following issue: "${issue}". Search the docs and provide a step-by-step solution. If you cannot solve it, let them know human staff will check it soon. You can use the close_ticket tool if you believe the issue is entirely resolved.`,
          isReply: false,
          isSupportTicket: true,
          author: {
            id: interaction.user.id,
            username: interaction.user.username,
            displayName:
              (interaction.member as { displayName?: string } | null)?.displayName ??
              interaction.user.globalName ??
              interaction.user.username,
          }
        }
      });

    } catch (error: any) {
      this.container.logger.error("Support Command Error:", error);
      await this.replyError(interaction, "AI Error", `Failed to create ticket: ${error.message}`);
    }
  }
}
