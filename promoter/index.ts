import {
  defineModule,
  type ListenerDefinition,
  type ModuleServices,
  type TaskDefinition,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, type CardReply } from "@lumi/ui";
import {
  MessageFlags,
  type GuildMember,
  type Interaction,
  type PartialGuildMember,
  type Presence,
} from "discord.js";
import { promoterCommand } from "./commands/promoter.js";
import {
  ConfigSchema,
  ModuleName,
  describeSignals,
  getConfig,
  getGranted,
  statusMatches,
  wearsServerTag,
} from "./data.js";
import { converge, customStatusText, runSweepTask } from "./engine.js";
import {
  grantedCard,
  holdingCard,
  notEligibleCard,
  notManageableCard,
  revokedCard,
  unconfiguredCard,
  unmanagedCard,
  unreadableCard,
} from "./ui.js";

const presenceListener: ListenerDefinition = {
  event: "presenceUpdate",
  async handler(
    _oldPresence: Presence | null,
    newPresence: Presence,
    services: ModuleServices,
  ) {
    const guild = newPresence.guild;
    if (!guild) return;
    if (newPresence.user?.bot) return;
    const member =
      newPresence.member ??
      (await guild.members.fetch(newPresence.userId).catch(() => null));
    if (!member) return;

    await converge(services, {
      guildId: guild.id,
      member,
      statusText: customStatusText(newPresence),
      worn: wearsServerTag(member.user.primaryGuild, guild.id),
    });
  },
};

const memberUpdateListener: ListenerDefinition = {
  event: "guildMemberUpdate",
  async handler(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
    services: ModuleServices,
  ) {
    if (newMember.user.bot) return;
    const oldTag = oldMember.user?.primaryGuild;
    const newTag = newMember.user.primaryGuild;
    if (
      oldTag?.identityGuildId === newTag?.identityGuildId &&
      oldTag?.identityEnabled === newTag?.identityEnabled
    ) {
      return;
    }

    await converge(services, {
      guildId: newMember.guild.id,
      member: newMember,
      statusText: customStatusText(newMember.presence),
      worn: wearsServerTag(newTag, newMember.guild.id),
    });
  },
};

const interactionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== `${ModuleName}:check`) return;

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Status checks run in a server."),
        ),
      );
      return;
    }
    if (!services.modules.isEnabled(guild.id, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Module Disabled", "The Promoter module is disabled."),
        ),
      );
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = await guild.members
      .fetch(interaction.user.id)
      .catch(() => null);
    if (!member) {
      await interaction.editReply(
        ephemeralCard(
          makeErrorCard(
            "Member Not Found",
            "You are not a member of this server.",
          ),
        ),
      );
      return;
    }

    const config = await getConfig(services, guild.id);
    const statusText = customStatusText(member.presence);
    const worn = wearsServerTag(member.user.primaryGuild, guild.id);
    const result = await converge(services, {
      guildId: guild.id,
      member,
      statusText,
      worn,
    });

    const terms = config.matchTerms
      .map((term) => term.trim())
      .filter((term) => term.length > 0);
    const statusMatched =
      statusText !== null && statusMatches(statusText, terms);
    const reason = describeSignals(
      statusMatched,
      config.detectServerTag && worn,
    );

    let card: CardReply;
    switch (result) {
      case "granted":
        card = grantedCard(reason);
        break;
      case "revoked":
        card = revokedCard();
        break;
      case "holding": {
        const record = await getGranted(services, guild.id, member.id);
        card = record ? holdingCard(record) : grantedCard(reason);
        break;
      }
      case "unreadable":
        card = unreadableCard();
        break;
      case "unmanaged":
        card = unmanagedCard(config);
        break;
      case "not-manageable":
        card = notManageableCard();
        break;
      case "unconfigured":
        card = unconfiguredCard();
        break;
      default:
        card = notEligibleCard(config);
        break;
    }

    await interaction.editReply(ephemeralCard(card));
  },
};

const sweepTask: TaskDefinition = {
  name: "sweep",
  cron: "*/1 * * * *",
  handler: runSweepTask,
};

const promoterModule = defineModule({
  name: ModuleName,
  displayName: "Promoter",
  emoji: "📣",
  description:
    "Auto-role for members advertising the server in their custom status or with its native server tag.",
  version: "2.0.0",
  config: ConfigSchema,
  permitNodes: ["mod.promoter", "admin.promoter"],
  dataLifecycle: {
    async exportUserData(services, guildId, userId) {
      return services.helpers.moduleData.list({
        guildId,
        moduleName: ModuleName,
        targetId: userId,
        key: "granted",
      });
    },
    async deleteUserData(services, guildId, userId) {
      const deleted = await services.helpers.moduleData.delete(
        guildId,
        ModuleName,
        userId,
        "granted",
      );
      return { deleted };
    },
  },
  commands: [promoterCommand],
  listeners: [presenceListener, memberUpdateListener, interactionListener],
  tasks: [sweepTask],
  async onLoad() {
    return [];
  },
  async onUnload() {},
});

export default promoterModule;
