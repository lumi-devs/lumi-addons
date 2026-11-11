import type {
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import type { Interaction } from "discord.js";
import { listRules, ModuleName } from "../data.js";
import { RulesListPrefix, rulesPageCard } from "../ui.js";

export const rulesListListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(
    interaction: Interaction,
    services: ModuleServices,
  ): Promise<void> {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith(RulesListPrefix)) return;
    const [, , userId, action, pageToken] = interaction.customId.split(":");
    if (!userId) return;
    if (interaction.user.id !== userId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Panel",
            "Run `/activityroles list` to open your own rule list.",
          ),
        ),
      );
      return;
    }
    const guildId = interaction.guildId;
    if (!guildId) return;
    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "Activity Roles is disabled in this server.",
          ),
        ),
      );
      return;
    }
    if (action !== "prev" && action !== "next") return;
    const pageIndex = Number.parseInt(pageToken ?? "0", 10);
    await interaction.deferUpdate();
    const rules = await listRules(services, guildId);
    await interaction.editReply(
      rulesPageCard(
        rules,
        (Number.isFinite(pageIndex) ? pageIndex : 0) + 1,
        userId,
      ),
    );
  },
};
