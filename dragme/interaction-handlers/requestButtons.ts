import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import type { ButtonInteraction, GuildMember } from "discord.js";
import { channelMention, userMention } from "@discordjs/formatters";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
  noPingCard,
} from "#utilities/cards.js";
import { scheduleTask, cancelTask } from "#lib/schedule-task.js";
import { dragmeExpireJobId, dragmeRevokeJobId } from "../keys.js";
import { getDragmeConfig } from "../lib/config.js";
import { buildRequestButtons } from "../lib/create-request.js";
import { deleteRequest, getRequest } from "../lib/requests.js";

@ApplyOptions<InteractionHandler.Options>({
  name: "dragme-buttons",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class DragmeButtonHandler extends InteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("dragme:")) return this.none();
    const [, verb, guildId, userId] = interaction.customId.split(":");
    if ((verb !== "acc" && verb !== "dec") || !guildId || !userId)
      return this.none();
    return this.some({ verb, guildId, userId });
  }

  public async run(
    interaction: ButtonInteraction,
    {
      verb,
      guildId,
      userId,
    }: { verb: string; guildId: string; userId: string },
  ): Promise<void> {
    if (!interaction.inCachedGuild() || interaction.guildId !== guildId) return;

    const req = await getRequest(guildId, userId);
    if (!req) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Gone", "This drag request is no longer active."),
        ),
      );
      return;
    }

    const target = interaction.guild.channels.cache.get(req.targetChannelId);
    if (!target?.isVoiceBased()) {
      await deleteRequest(guildId, userId);
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Gone",
            "The requested voice channel no longer exists.",
          ),
        ),
      );
      return;
    }

    const presser = interaction.member;
    if (presser.voice.channelId !== target.id) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Call",
            `Only members currently in ${channelMention(target.id)} can respond to this request.`,
          ),
        ),
      );
      return;
    }

    await deleteRequest(guildId, userId);
    await cancelTask(dragmeExpireJobId(guildId, userId)).catch(() => null);
    const disabledRows = buildRequestButtons(guildId, userId, true);

    if (verb === "dec") {
      await interaction.update(
        noPingCard(
          makeWarningCard(
            "Drag Request Declined",
            `${userMention(presser.id)} declined ${userMention(userId)}'s request to join ${channelMention(target.id)}.`,
            { actionRows: disabledRows },
          ),
        ),
      );
      return;
    }

    // Accept.
    const requester: GuildMember | null = await interaction.guild.members
      .fetch(userId)
      .catch(() => null);
    if (!requester) {
      await interaction.update(
        noPingCard(
          makeErrorCard(
            "Member Left",
            "The requester is no longer in this server.",
            { actionRows: disabledRows },
          ),
        ),
      );
      return;
    }

    let outcome: string;
    if (requester.voice.channelId) {
      await requester.voice.setChannel(
        target,
        `Drag request accepted by ${presser.user.tag}`,
      );
      outcome = `moved into ${channelMention(target.id)}`;
    } else {
      const cfg = await getDragmeConfig(guildId);
      await target.permissionOverwrites.create(
        requester.id,
        { Connect: true },
        { reason: `Drag request accepted by ${presser.user.tag}` },
      );
      await scheduleTask(
        "dragme-revoke",
        { guildId, userId, channelId: target.id },
        {
          repeated: false,
          delay: cfg.graceMinutes * 60_000,
          customJobOptions: {
            jobId: dragmeRevokeJobId(guildId, userId),
            removeOnComplete: true,
            removeOnFail: true,
          },
        },
      );
      outcome = `granted a **${cfg.graceMinutes}-minute** pass to join ${channelMention(target.id)} (they weren't in voice, so I couldn't move them)`;
    }

    await interaction.update(
      noPingCard(
        makeSuccessCard(
          "Drag Request Accepted",
          `${userMention(presser.id)} accepted — ${userMention(userId)} ${outcome}.`,
          { actionRows: disabledRows },
        ),
      ),
    );
  }
}
