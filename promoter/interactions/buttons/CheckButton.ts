import { defineInteraction } from "@lumi-devs/lumi/lib/interactions/InteractionDef.js";
import type { Container } from "@lumi-devs/lumi/lib/Services.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard, makeWarningCard, makeInfoCard } from "@lumi-devs/lumi/lib/ui/Cards.js";
import type { ButtonInteraction } from "discord.js";
import { MODULE_NAME } from "../../utilities/Keys.js";
import { converge, getMemberState, getPromoterConfig } from "../../Index.js";
import { wearsServerTag } from "../../utilities/Matching.js";

export const checkButton = defineInteraction({
  prefix: "promoter:check",
  kinds: ["button"],
  module: MODULE_NAME,
  async run(services: Container, interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const { guildId } = interaction;
    if (!guildId) {
      return interaction.editReply(
        ephemeralCard(makeErrorCard("Guild Only", "This only works inside a server.")),
      );
    }

    const config = await getPromoterConfig(services, guildId);
    if (!config.roleId || config.matchTerms.length === 0) {
      return interaction.editReply(
        ephemeralCard(
          makeErrorCard("Not Configured", "This server has not finished configuring the promoter module."),
        ),
      );
    }

    const guild = services.client.guilds.cache.get(guildId);
    const member = await guild?.members.fetch(interaction.user.id).catch(() => null) ?? null;
    const roles = member?.roles.cache.map((r) => r.id) ?? [];
    const state = await getMemberState(services, guildId, interaction.user.id);
    const worn = wearsServerTag(member?.user.primaryGuild ?? null, guildId);

    const result = await converge(services, {
      guildId,
      userId: interaction.user.id,
      status: state?.status ?? "",
      worn,
      roles,
    });

    if (result === "granted") {
      return interaction.editReply(
        ephemeralCard(makeSuccessCard("Role Granted", "Thanks for promoting the server — enjoy the role!")),
      );
    }
    if (result === "revoked") {
      return interaction.editReply(
        ephemeralCard(
          makeWarningCard(
            "Role Removed",
            "You're no longer advertising the server, so the role was removed. Put the invite back to earn it again.",
          ),
        ),
      );
    }
    if (result === "holding") {
      return interaction.editReply(
        ephemeralCard(makeSuccessCard("Role Active", "You're advertising the server — the role is yours.")),
      );
    }
    return interaction.editReply(
      ephemeralCard(
        makeInfoCard(
          "No Change",
          "Nothing to update. Put the server invite in your **custom status** or wear the server tag to earn the role.",
        ),
      ),
    );
  },
});
