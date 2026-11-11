import type {
  CommandDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import {
  ephemeralCard,
  formatTimestamp,
  makeErrorCard,
} from "@lumi/ui";
import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  ModuleName,
  claimCooldown,
  findCrimeTier,
  getActiveJail,
  getConfig,
  requireGuildId,
  rollCrime,
  setJail,
} from "../data.js";
import { crimeOutcomeCard, crimePickerCard } from "../ui.js";

export async function runCrimeAttempt(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  services: ModuleServices,
  guildId: string,
  tierId: string,
): Promise<void> {
  const tier = findCrimeTier(tierId);
  if (!tier) {
    await interaction.editReply(
      ephemeralCard(makeErrorCard("Crime", "Unknown crime tier.")),
    );
    return;
  }

  const config = await getConfig(services, guildId);
  const userId = interaction.user.id;
  const jail = await getActiveJail(services, guildId, userId);
  if (jail) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard(
          "Jailed",
          `You are serving time for ${jail.reason}. Released ${formatTimestamp(new Date(jail.expiresAt), "R")}.`,
        ),
      ),
    );
    return;
  }

  const cooldownMs = config.crimeCooldownMinutes * 60_000;
  const cooldown = await claimCooldown(
    services,
    guildId,
    userId,
    "crime",
    cooldownMs,
  );
  if (!cooldown.ok) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard(
          "Lay Low",
          `The heat is still on. Try again ${formatTimestamp(new Date(cooldown.expiresAt), "R")}.`,
        ),
      ),
    );
    return;
  }

  const outcome = rollCrime(tier);
  if (outcome.success) {
    await services.helpers.economy.credit(guildId, userId, outcome.payout, {
      ledger: { type: "crime_payout", description: tier.label },
    });
    await interaction.editReply(
      crimeOutcomeCard(outcome, null, cooldown.expiresAt),
    );
    return;
  }

  const jailExpiresAt =
    cooldownMs > 0
      ? await setJail(
          services,
          guildId,
          userId,
          config.crimeCooldownMinutes,
          `a failed ${tier.label.toLowerCase()} job`,
        )
      : null;
  await interaction.editReply(
    crimeOutcomeCard(outcome, jailExpiresAt, cooldown.expiresAt),
  );
}

export const crimeCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("crime")
    .setDescription("Commit a crime for a payout or jail time")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("Risk level")
        .setRequired(false)
        .addChoices(
          { name: "Low risk", value: "low" },
          { name: "Medium risk", value: "medium" },
          { name: "High risk", value: "high" },
        ),
    ),
  guildOnly: true,
  async execute(interaction, services) {
    const guildId = await requireGuildId(interaction, services);
    if (!guildId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const tier = interaction.options.getString("tier");
    if (!tier) {
      const jail = await getActiveJail(
        services,
        guildId,
        interaction.user.id,
      );
      if (jail) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              "Jailed",
              `You are serving time for ${jail.reason}. Released ${formatTimestamp(new Date(jail.expiresAt), "R")}.`,
            ),
          ),
        );
        return;
      }
      await interaction.editReply(crimePickerCard(interaction.user.id));
      return;
    }
    await runCrimeAttempt(interaction, services, guildId, tier);
  },
};

export async function handleCrimeSelect(
  interaction: StringSelectMenuInteraction,
  services: ModuleServices,
): Promise<void> {
  const parts = interaction.customId.split(":");
  const userId = parts[2];
  if (!userId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Crime", "That menu is stale. Run `/crime` again."),
      ),
    );
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Server Only", "Crime only works inside a server."),
      ),
    );
    return;
  }
  if (!services.modules.isEnabled(guildId, ModuleName)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Module Disabled", "Economy Games is disabled here."),
      ),
    );
    return;
  }
  if (interaction.user.id !== userId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Not Your Crime",
          "That menu belongs to someone else. Plan your own with `/crime`.",
        ),
      ),
    );
    return;
  }

  const tierId = interaction.values[0];
  if (!tierId) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Crime", "Pick a crime first.")),
    );
    return;
  }

  await interaction.deferUpdate();
  await runCrimeAttempt(interaction, services, guildId, tierId);
}