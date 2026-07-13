import { ApplyOptions } from "@sapphire/decorators";
import type { Subcommand } from "@sapphire/plugin-subcommands";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  channelMention,
  time,
  TimestampStyles,
  userMention,
} from "@discordjs/formatters";
import { BaseSubcommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions.js";

import { paginateList } from "#utilities/pagination.js";
import { cancelTask } from "#lib/schedule-task.js";
import { dragmeExpireJobId } from "../keys.js";
import { deleteRequest, listRequests } from "../lib/requests.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "dragme-admin",
  description: "Moderate voice drag requests.",
  permissionLevel: PermissionLevel.MOD,
  preconditions: ["GuildOnly"],
  subcommands: [
    { name: "active", chatInputRun: "chatInputActive" },
    { name: "clear", chatInputRun: "chatInputClear" },
  ],
})
export class DragmeAdminCommand extends BaseSubcommand {
  public override registerApplicationCommands(registry: Subcommand.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub.setName("active").setDescription("List pending drag requests"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("clear")
            .setDescription("Clear all pending drag requests"),
        ),
    );
  }

  public async chatInputActive(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const requests = await listRequests(interaction.guildId);
    const lines = requests.map(
      (r) =>
        `${userMention(r.userId)} → ${channelMention(r.targetChannelId)} · expires ${time(new Date(r.expiresAt), TimestampStyles.RelativeTime)}`,
    );
    await paginateList({
      interactionOrMessage: interaction,
      userId: interaction.user.id,
      title: "Pending Drag Requests",
      items: lines,
      perPage: 5,
      ephemeral: true,
    });
  }

  public async chatInputClear(
    interaction: ChatInputCommandInteraction<"cached">,
  ) {
    const requests = await listRequests(interaction.guildId);
    for (const r of requests) {
      await deleteRequest(r.guildId, r.userId);
      await cancelTask(dragmeExpireJobId(r.guildId, r.userId)).catch(
        () => null,
      );
    }
    return this.replySuccess(
      interaction,
      "Requests Cleared",
      `Removed **${requests.length}** pending request(s).`,
    );
  }
}
