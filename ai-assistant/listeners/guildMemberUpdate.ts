import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember, TextChannel } from "discord.js";
import { processAiRequest } from "../lib/ai-executor.js";

@ApplyOptions<Listener.Options>({
  name: "aiModAuditTimeout",
  event: Events.GuildMemberUpdate,
})
export default class AiModAuditTimeoutListener extends Listener<typeof Events.GuildMemberUpdate> {
  public override async run(oldMember: GuildMember, newMember: GuildMember) {
    // Check if the user was just timed out
    const wasTimedOut = !oldMember.isCommunicationDisabled() && newMember.isCommunicationDisabled();
    if (!wasTimedOut) return;

    const guild = newMember.guild;
    const config = this.container.db.config;
    
    // Check if audit is enabled
    const auditEnabled = await config.getModuleConfig(guild.id, "ai-assistant", "modAuditEnabled");
    if (auditEnabled === false) return; // default to true if undefined, but let's be safe

    const apiUrl = await config.getModuleConfig(guild.id, "ai-assistant", "apiUrl") as string || "https://openrouter.ai/api/v1";
    const apiKey = await config.getModuleConfig(guildId, "ai-assistant", "apiKey") as string || process.env.OPENROUTER_API_KEY || "";
    const modelName = await config.getModuleConfig(guild.id, "ai-assistant", "modelName") as string || "meta-llama/llama-3.1-8b-instruct:free";

    try {
      // Find a channel to send the report to. Ideally an admin channel or system channel.
      const logChannel = guild.systemChannel || guild.channels.cache.find(c => c.name.includes("mod-log") || c.name.includes("admin")) as TextChannel;
      if (!logChannel) return;

      const prompt = `A user named ${newMember.user.tag} (ID: ${newMember.id}) was just timed out by a moderator. Please generate a brief, objective 'Incident Report' acknowledging this action. Suggest 2 things the mod team should keep an eye on when this user returns based on typical behavioral patterns of timed-out users. Keep it professional and short.`;

      const responseText = await processAiRequest(
        apiUrl,
        apiKey,
        modelName,
        prompt,
        guild,
        logChannel
      );

      await logChannel.send({
        content: `**🤖 AI Mod Audit Report: User Timeout**\nUser: <@${newMember.id}>\n\n${responseText}`
      });

    } catch (error) {
      this.container.logger.error("Mod Audit Listener Error:", error);
    }
  }
}
