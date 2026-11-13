import type { ModuleServices } from "@lumi/module-kit";
import {
  cardMessage,
  createActionButton,
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import {
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
} from "discord.js";
import { listRecentConfessions, setReplyDmOptOut } from "../../data.js";
import {
  buildConfessionList,
  UnmuteDmButtonPrefix,
} from "../../ui.js";
import { replyEphemeral, requireGuild } from "../helpers.js";

export async function handleDmOptOut(
  interaction: ButtonInteraction,
  services: ModuleServices,
  guildId: string | undefined,
  optOut: boolean,
): Promise<void> {
  if (!guildId) return;
  await setReplyDmOptOut(services, guildId, interaction.user.id, optOut);

  const card = optOut
    ? makeWarningCard(
        "Reply DMs Off",
        "You won't be DM'd about replies in that server anymore.",
        {
          actionRows: [
            row(
              createActionButton({
                customId: `${UnmuteDmButtonPrefix}:${guildId}`,
                label: "Undo",
                style: ButtonStyle.Secondary,
              }),
            ),
          ],
        },
      )
    : makeSuccessCard(
        "Reply DMs On",
        "You'll be DM'd when someone replies to you again.",
      );

  const payload = interaction.inGuild() ? ephemeralCard(card) : card;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(cardMessage(payload)).catch(() => undefined);
    return;
  }
  await interaction
    .reply({
      ...payload,
      ...(interaction.inGuild()
        ? { flags: (payload.flags ?? 0) | MessageFlags.Ephemeral }
        : {}),
    })
    .catch(() => undefined);
}

export async function handleListButton(
  interaction: ButtonInteraction,
  services: ModuleServices,
  parts: string[],
): Promise<void> {
  const userId = parts[2];
  const action = parts[3];
  if (!userId) return;

  if (interaction.user.id !== userId) {
    await replyEphemeral(
      interaction,
      makeErrorCard(
        "Not Your Panel",
        "This confession list belongs to another moderator.",
      ),
    );
    return;
  }

  if (action !== "prev" && action !== "next") return;

  const guildId = await requireGuild(interaction, services);
  if (!guildId) return;

  const page = Number(parts[4]);
  const items = await listRecentConfessions(services, guildId);
  await interaction
    .update(
      buildConfessionList(
        guildId,
        items,
        Number.isInteger(page) && page >= 0 ? page : 0,
        userId,
      ),
    )
    .catch(() => undefined);
}
