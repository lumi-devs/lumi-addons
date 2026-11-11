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
} from "discord.js";
import type { GrindKind } from "../data.js";
import {
  Grinds,
  claimCooldown,
  cooldownMinutesFor,
  getConfig,
  requireGuildId,
  rollGrind,
} from "../data.js";
import { grindResultCard } from "../ui.js";

async function runGrind(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  kind: GrindKind,
  name: string,
  description: string,
): Promise<void> {
  const guildId = await requireGuildId(interaction, services);
  if (!guildId) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const config = await getConfig(services, guildId);
  const cooldownMs = cooldownMinutesFor(config, kind) * 60_000;
  const cooldown = await claimCooldown(
    services,
    guildId,
    interaction.user.id,
    kind,
    cooldownMs,
  );
  if (!cooldown.ok) {
    await interaction.editReply(
      ephemeralCard(
        makeErrorCard(
          "On Cooldown",
          `You can ${name} again ${formatTimestamp(new Date(cooldown.expiresAt), "R")}.`,
        ),
      ),
    );
    return;
  }

  const definition = Grinds[kind];
  const outcome = rollGrind(definition);
  await services.helpers.economy.credit(
    guildId,
    interaction.user.id,
    outcome.total,
    {
      ledger: { type: `${kind}_payout`, description: description },
    },
  );
  await interaction.editReply(
    grindResultCard(definition, outcome, cooldown.expiresAt),
  );
}

function createGrindCommand(
  kind: GrindKind,
  name: string,
  description: string,
): CommandDefinition {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description)
      .setDMPermission(false),
    guildOnly: true,
    async execute(interaction, services) {
      await runGrind(interaction, services, kind, name, description);
    },
  };
}

export const workCommand = createGrindCommand(
  "work",
  "work",
  "Work a shift for a random payout",
);

export const begCommand = createGrindCommand(
  "beg",
  "beg",
  "Beg for spare change",
);

export const fishCommand = createGrindCommand(
  "fish",
  "fish",
  "Fish the docks and sell your catch",
);

export const mineCommand = createGrindCommand(
  "mine",
  "mine",
  "Mine ore for a random payout",
);