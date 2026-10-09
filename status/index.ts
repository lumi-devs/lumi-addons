import { defineModule } from "lumi";
import { onEvent } from "lumi/events";
import { registerTaskFireHandler } from "lumi/scheduling";
import { handleStatusRotateFire, nudgeGuild } from "./lib/rotate-handler.js";

export const meta = defineModule({
  name: "status",
  displayName: "Status Rotator",
  emoji: "🔁",
  version: "1.0.0",
  description:
    "Rotating bot presence managed by the bot owner via /status. Entries and rotation state are scoped per server.",
  short: "Owner-managed rotating presence.",
  endUserDataStatement:
    "Stores rotating bot status entries configured by bot owners, scoped per server. Records the owner user ID who created each status entry for audit purposes.",
});

registerTaskFireHandler("status:rotate", handleStatusRotateFire);

async function nudgeFromEvent(data: Record<string, unknown>): Promise<void> {
  const guildId = data["guildId"];
  if (typeof guildId !== "string" || guildId.length === 0) return;
  await nudgeGuild(guildId).catch(() => undefined);
}

onEvent("presenceUpdate", nudgeFromEvent);
onEvent("voiceStateUpdate", nudgeFromEvent);
onEvent("guildMemberUpdate", nudgeFromEvent);
onEvent("messageCreate", nudgeFromEvent);
onEvent("threadCreate", nudgeFromEvent);
