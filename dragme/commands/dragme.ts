import { defineCommand, type CommandContext } from "lumi/commands";
import { createDragRequest } from "../lib/create-request.js";
import { channelMention } from "../lib/cards.js";

export default defineCommand({
  name: "dragme",
  description: "Ask the people in a member's voice channel to drag you in.",
  build: () => ({
    name: "dragme",
    description: "Ask the people in a member's voice channel to drag you in.",
    options: [
      {
        type: 6,
        name: "user",
        description: "A user in the voice channel you want to join",
        required: true,
      },
      {
        type: 7,
        name: "channel",
        description: "The voice channel you want to join",
        required: true,
        channel_types: [2],
      },
    ],
  }),
  run: async (ctx: CommandContext) => {
    if (!ctx.guildId) {
      return ctx.replyError("Guild Only", "This command only works inside a server.");
    }
    const target = await ctx.getUser("user");
    const channel = await ctx.getChannel("channel");
    if (!target || !channel) {
      return ctx.replyError(
        "Can't Do That",
        "Run this as a slash command and pick a user and a voice channel.",
      );
    }

    const result = await createDragRequest({
      guildId: ctx.guildId,
      requesterId: ctx.user.id,
      requesterRoles: ctx.member?.roles ?? [],
      targetUserId: target.id,
      targetChannelId: channel.id,
    });
    if (!result.ok) return ctx.replyError("Can't Do That", result.reason);

    return ctx.replySuccess(
      "Request Posted",
      `Asked the members of ${channelMention(channel.id)} to drag you in.`,
    );
  },
});
