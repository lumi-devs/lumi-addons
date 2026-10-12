import type { ButtonInteraction } from "discord.js";
import { defineInteraction } from "#src/lib/interactions/InteractionDef.js";
import { ephemeralCard, makeErrorCard } from "#src/lib/ui/Cards.js";
import type { Container } from "#src/lib/Services.js";
import { channelMention, disabledPayload, userMention } from "../../utilities/Cards.js";
import { getRequest, setRequest } from "../../utilities/Requests.js";

export const requestButtons = defineInteraction<ButtonInteraction>({
  prefix: ["dragme:accept", "dragme:deny"],
  kinds: ["button"],
  module: "dragme",
  async run(services: Container, interaction: ButtonInteraction) {
    if (!interaction.inGuild()) return;

    const parts = interaction.customId.split(":");
    const verb = parts[1] as "accept" | "deny" | undefined;
    const requestId = parts[2];
    if ((verb !== "accept" && verb !== "deny") || !requestId) return;

    const req = await getRequest(services, interaction.guildId, requestId);
    if (!req || req.status !== "pending" || req.expiresAt <= Date.now()) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Gone", "This drag request is no longer active.")),
      );
      return;
    }

    const guild = interaction.guild ?? services.client.guilds.cache.get(interaction.guildId);
    if (!guild) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Error", "Could not resolve guild.")),
      );
      return;
    }

    const voiceChannel = guild.channels.cache.get(req.channelId);
    if (!voiceChannel || !voiceChannel.isVoiceBased()) {
      await interaction.reply(
        ephemeralCard(makeErrorCard("Gone", "That voice channel no longer exists.")),
      );
      return;
    }

    if (!voiceChannel.members.has(interaction.user.id)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Not Your Call",
            `Only members currently in ${channelMention(req.channelId)} can respond to this request.`,
          ),
        ),
      );
      return;
    }

    req.status = verb === "accept" ? "accepted" : "declined";
    await Promise.all([
      setRequest(services, req),
      setRequest(services, { ...req, requestId: req.requesterId }),
    ]);

    await interaction.deferUpdate();

    if (verb === "deny") {
      await editCard(services, req, "Drag Request Declined",
        `${userMention(interaction.user.id)} declined ${userMention(req.requesterId)}'s request to join ${channelMention(req.channelId)}.`,
        "warning",
      );
      return;
    }

    const requester = await guild.members.fetch(req.requesterId).catch(() => null);
    if (!requester) {
      await editCard(services, req, "Member Left",
        "The requester is no longer in this server.", "error",
      );
      return;
    }

    try {
      await requester.voice.setChannel(req.channelId);
    } catch {
      await editCard(services, req, "Drag Failed",
        `${userMention(req.requesterId)} couldn't be moved into ${channelMention(req.channelId)} — they may have left voice.`,
        "error",
      );
      return;
    }

    await editCard(services, req, "Drag Request Accepted",
      `${userMention(interaction.user.id)} dragged ${userMention(req.requesterId)} into ${channelMention(req.channelId)}.`,
      "success",
    );
  },
});

async function editCard(
  services: Container,
  req: import("../../utilities/Keys.js").DragRequestRecord,
  title: string,
  body: string,
  kind: "success" | "warning" | "error",
): Promise<void> {
  try {
    const channel = await services.client.channels.fetch(req.cardChannelId);
    if (!channel || !channel.isTextBased()) return;
    const message = await channel.messages.fetch(req.cardMessageId);
    const payload = disabledPayload(req, title, body, kind);
    await message.edit({
      components: [...payload.components],
      allowedMentions: { parse: [] },
    });
  } catch {
    // already gone
  }
}
