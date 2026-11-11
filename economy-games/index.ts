import {
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
  type TaskDefinition,
} from "@lumi/module-kit";
import type { Interaction } from "discord.js";
import {
  blackjackCommand,
  handleBlackjackButton,
} from "./commands/blackjack.js";
import { crimeCommand, handleCrimeSelect } from "./commands/crime.js";
import {
  begCommand,
  fishCommand,
  mineCommand,
  workCommand,
} from "./commands/grind.js";
import { rouletteCommand } from "./commands/roulette.js";
import { shopCommand } from "./commands/shop.js";
import {
  ConfigSchema,
  ModuleName,
  sweepBlackjacks,
} from "./data.js";

const interactionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith(`${ModuleName}:blackjack:`)) {
        await handleBlackjackButton(interaction, services);
      }
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith(`${ModuleName}:crime:`)) {
        await handleCrimeSelect(interaction, services);
      }
    }
  },
};

const blackjackSweepTask: TaskDefinition = {
  name: "blackjack-sweep",
  cron: "*/5 * * * *",
  timezone: "UTC",
  async handler(services) {
    const refunded = await sweepBlackjacks(services);
    if (refunded > 0) {
      services.observability.logger.info("Refunded expired blackjack games", {
        refunded,
      });
    }
  },
};

const moduleDefinition: ModuleDefinition = defineModule({
  name: ModuleName,
  displayName: "Economy Games",
  emoji: "🎰",
  description:
    "Blackjack, roulette, crime, work grinds, and a role-granting shop on the economy ledger.",
  version: "2.0.0",
  config: ConfigSchema,
  dataLifecycle: {
    async exportUserData(
      services: ModuleServices,
      guildId: string,
      userId: string,
    ) {
      const [records, economy] = await Promise.all([
        services.helpers.moduleData.list({
          guildId,
          moduleName: ModuleName,
          targetId: userId,
        }),
        services.helpers.economy.exportUserData(guildId, userId),
      ]);
      return { records, economy };
    },
    async deleteUserData(
      services: ModuleServices,
      guildId: string,
      userId: string,
    ) {
      const [records, economy] = await Promise.all([
        services.helpers.moduleData.deleteForUser(ModuleName, userId),
        services.helpers.economy.deleteUserData(guildId, userId),
      ]);
      return {
        deleted: records + (economy.deleted ?? 0),
        ...(economy.anonymised === undefined
          ? {}
          : { anonymised: economy.anonymised }),
        notes: [...(economy.notes ?? []), `moduleData=${records}`],
      };
    },
  },
  commands: [
    blackjackCommand,
    rouletteCommand,
    crimeCommand,
    workCommand,
    begCommand,
    fishCommand,
    mineCommand,
    shopCommand,
  ],
  listeners: [interactionListener],
  tasks: [blackjackSweepTask],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default moduleDefinition;