import { defineModule } from "lumi";
import { onEvent } from "lumi/events";
import { handleGuildMemberUpdate, handlePresenceUpdate } from "./lib/converge.js";

export const meta = defineModule({
  name: "activity-roles",
  displayName: "Activity Roles",
  emoji: "🎮",
  version: "1.0.0",
  description:
    "Auto-assign roles based on users' Discord presence (Playing, Streaming, Listening, Watching, Custom, Competing).",
  short: "Presence-based role automation.",
  endUserDataStatement:
    "Stores each member's recent activity snapshot and the role IDs this addon granted, keyed by user ID in guild storage, to assign and revoke activity roles. Removed when the member's data is purged.",
});

onEvent("presenceUpdate", handlePresenceUpdate);
onEvent("guildMemberUpdate", handleGuildMemberUpdate);
