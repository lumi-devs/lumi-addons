import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { makeInfoCard, makeSuccessCard } from "#utilities/cards.js";

interface Parsed {
  minMessages: number;
  scope: "all" | "enabled";
  stripMembers: boolean;
}

@ApplyOptions<InteractionHandler.Options>({
  name: "thread-cleaner-sweep-confirm",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class SweepConfirmHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (interaction.customId === "tc:sweep:x")
      return this.some(null as Parsed | null);
    if (!interaction.customId.startsWith("tc:sweep:go:")) return this.none();

    const [, , , min, scope, strip] = interaction.customId.split(":");
    const minMessages = Number(min);
    if (
      !Number.isInteger(minMessages) ||
      (scope !== "all" && scope !== "enabled")
    )
      return this.none();
    return this.some({
      minMessages,
      scope,
      stripMembers: strip === "1",
    } as Parsed);
  }

  public async run(interaction: ButtonInteraction, data: Parsed | null) {
    if (data === null)
      return interaction.update(
        makeInfoCard("Cancelled", "No threads were touched."),
      );
    if (!interaction.inCachedGuild()) return;

    await scheduleTask(
      "thread-cleaner-sweep",
      {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        requesterId: interaction.user.id,
        minMessages: data.minMessages,
        scope: data.scope,
        stripMembers: data.stripMembers,
      },
      {
        delay: 0,
        customJobOptions: { removeOnComplete: true, removeOnFail: true },
      },
    );

    return interaction.update(
      makeSuccessCard(
        "🧹 Sweep Started",
        "Working through this server's threads now — a summary will be posted in this channel when it's done.",
      ),
    );
  }
}
