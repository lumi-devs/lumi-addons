import { defineModule } from "@lumi-devs/lumi/module";

export const utilityAddonModule = defineModule({
  name: "utility",
  displayName: "Utility",
  emoji: "⚙️",
  version: "1.0.0",
  description: "General utility addons including auto-translate and emoji-stealer.",
  short: "General utility tools.",
  endUserDataStatement:
    "Processes transient translation and emoji extraction requests in real-time. Does not collect, persist, or retain any personal user data or message content.",
});
