import type { CommandDefinition, ModuleServices } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { ModuleName, getConfig, getStats } from "../data.js";
import { panelCard, statsCard } from "../ui.js";

function memberRoleIds(
  interaction: ChatInputCommandInteraction,
  guildId: string,
): string[] {
  const roles = interaction.member?.roles;
  if (!roles) return [];
  if (Array.isArray(roles)) {
    return roles.filter((roleId) => roleId !== guildId);
  }
  return Array.from(roles.cache.keys()).filter((roleId) => roleId !== guildId);
}

async function hasPermit(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  node: string,
): Promise<boolean> {
  if (!interaction.guild) return false;
  const result = await services.permits.explainPermit(
    {
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      roleIds: memberRoleIds(interaction, interaction.guild.id),
      ...(interaction.channelId ? { channelId: interaction.channelId } : {}),
      guildOwnerId: interaction.guild.ownerId,
      permitNode: node,
    },
    services.client,
  );
  return result.allowed;
}

async function hasAdminAccess(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<boolean> {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }
  return hasPermit(interaction, services, "admin.promoter");
}

async function hasModAccess(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<boolean> {
  if (await hasAdminAccess(interaction, services)) return true;
  return hasPermit(interaction, services, "mod.promoter");
}

export const promoterCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("promoter")
    .setDescription("Promoter-role tools")
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Post the promoter info panel with a status check"),
    )
    .addSubcommand((sub) =>
      sub.setName("stats").setDescription("Show all-time grant and revoke totals"),
    ),
  guildOnly: true,
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Promoter runs per server."),
        ),
      );
      return;
    }
    if (!services.modules.isEnabled(guild.id, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Module Disabled", "The Promoter module is disabled."),
        ),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "panel") {
      if (!(await hasAdminAccess(interaction, services))) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Missing Permission",
              "You need **Manage Server** or the `admin.promoter` permit.",
            ),
          ),
        );
        return;
      }
      const config = await getConfig(services, guild.id);
      await interaction.reply(panelCard(config, guild.name));
      return;
    }

    if (!(await hasModAccess(interaction, services))) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permission",
            "You need the `mod.promoter` permit or **Manage Server**.",
          ),
        ),
      );
      return;
    }
    const stats = await getStats(services, guild.id);
    await interaction.reply(ephemeralCard(statsCard(stats)));
  },
};
