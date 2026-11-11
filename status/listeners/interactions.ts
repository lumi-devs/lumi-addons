import type {
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import { cardMessage, ephemeralCard, makeErrorCard } from "@lumi/ui";
import type { ButtonInteraction, Interaction } from "discord.js";
import { getEntries, getState, ModuleName } from "../data.js";
import { listCard } from "../ui.js";

export const interactionsListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(`${ModuleName}:list:`)) return;
    if (!interaction.inCachedGuild()) return;
    if (!services.modules.isEnabled(interaction.guildId, ModuleName)) return;
    await handleListButton(interaction, services);
  },
};

async function handleListButton(
  interaction: ButtonInteraction<"cached">,
  services: ModuleServices,
): Promise<void> {
  const [prefix, action, userId, navigation, rawPage] =
    interaction.customId.split(":");
  if (prefix !== ModuleName || action !== "list" || !userId) return;
  if (navigation !== "prev" && navigation !== "next") return;

  if (interaction.user.id !== userId) {
    await interaction
      .reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Panel",
            "Run `/status list` to open your own status list.",
          ),
        ),
      )
      .catch(() => undefined);
    return;
  }

  const page = Number(rawPage);
  if (!Number.isInteger(page) || page < 0) return;

  const [entries, state] = await Promise.all([
    getEntries(services, interaction.guildId),
    getState(services, interaction.guildId),
  ]);

  await interaction
    .update(
      cardMessage(
        listCard({
          entries,
          state,
          page,
          userId,
        }),
      ),
    )
    .catch(() => undefined);
}