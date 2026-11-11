import type {
  CommandDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import {
  ephemeralCard,
  formatTimestamp,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import {
  ModuleName,
  readConfig,
  saveConfig,
  type RoleMentionsConfig,
} from "../config.js";
import {
  getBlock,
  getRoleDailyCounts,
  getTodayCounts,
  listBlocks,
} from "../data.js";
import {
  applyBlock,
  resolveManageableRole,
  restoreBlock,
} from "../protection.js";
import {
  buildRoleStatsCard,
  buildTopStatsCard,
  formatDuration,
  roleText,
} from "../ui.js";

async function hasAdminPermit(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<boolean> {
  const roles = interaction.member?.roles;
  const roleIds = !roles
    ? []
    : Array.isArray(roles)
      ? roles.filter((roleId) => roleId !== guild.id)
      : Array.from(roles.cache.keys()).filter(
          (roleId) => roleId !== guild.id,
        );
  const result = await services.permits.explainPermit(
    {
      guildId: guild.id,
      userId: interaction.user.id,
      roleIds,
      ...(interaction.channelId
        ? { channelId: interaction.channelId }
        : {}),
      guildOwnerId: guild.ownerId,
      permitNode: "admin.rolementions",
    },
    services.client,
  );
  return result.allowed;
}

async function requireAdmin(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<boolean> {
  if (await hasAdminPermit(interaction, services, guild)) return true;
  await interaction.reply(
    ephemeralCard(
      makeErrorCard(
        "Admin Only",
        "You need the `admin.rolementions` permit to change protection settings.",
      ),
    ),
  );
  return false;
}

async function showTop(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
  config: RoleMentionsConfig,
): Promise<void> {
  const limit = interaction.options.getInteger("limit") ?? 15;
  const counts = await getTodayCounts(services, guild.id);
  const entries = [...counts.entries()]
    .map(([roleId, count]) => ({
      roleId,
      roleName: guild.roles.cache.get(roleId)?.name ?? null,
      count,
    }))
    .sort(
      (a, b) => b.count - a.count || a.roleId.localeCompare(b.roleId),
    );
  const totalMentions = entries.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  if (entries.length === 0) {
    const body = ["No role mentions have been recorded today."];
    if (!config.analyticsEnabled) {
      body.push("Analytics is currently disabled in the module config.");
    }
    await interaction.reply(
      ephemeralCard(makeInfoCard("📊 Role Mentions Today", body)),
    );
    return;
  }
  await interaction.reply(
    ephemeralCard(
      buildTopStatsCard({
        guildName: guild.name,
        userId: interaction.user.id,
        page: 0,
        entries: entries.slice(0, limit),
        totalMentions,
      }),
    ),
  );
}

async function listProtection(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
  config: RoleMentionsConfig,
): Promise<void> {
  const blocks = await listBlocks(services, guild.id);
  const protectedLines =
    config.protectedRoleIds.length > 0
      ? config.protectedRoleIds.map((roleId) => {
          const role = guild.roles.cache.get(roleId);
          return `⚡ ${roleText(roleId, role?.name)} — ${formatDuration(config.autoBlockMinutes)}`;
        })
      : ["*None configured.*"];
  const blockLines =
    blocks.length > 0
      ? blocks.map((block) => {
          const role = guild.roles.cache.get(block.roleId);
          return `🔒 ${roleText(block.roleId, role?.name ?? block.roleName)} — expires ${formatTimestamp(new Date(block.expiresAt), "R")}`;
        })
      : ["*No active blocks.*"];

  await interaction.reply(
    ephemeralCard(
      makeInfoCard("🛡️ Role Mention Protection", [
        `**Protected roles (${config.protectedRoleIds.length})**\n${protectedLines.join("\n")}`,
        `**Active blocks (${blocks.length})**\n${blockLines.join("\n")}`,
      ]),
    ),
  );
}

async function resetCounters(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const counts = await getTodayCounts(services, guild.id);
  const moduleName = services.moduleName ?? ModuleName;
  const key = `mentions:${new Date().toISOString().slice(0, 10)}`;
  await Promise.all(
    [...counts.keys()].map((roleId) =>
      services.helpers.moduleData.delete(
        guild.id,
        moduleName,
        roleId,
        key,
      ),
    ),
  );
  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(
        "Counters Reset",
        "Today's role mention counters have been cleared.",
      ),
    ),
  );
}

async function showStats(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
  config: RoleMentionsConfig,
): Promise<void> {
  const role = interaction.options.getRole("role");
  if (role) {
    const entries = await getRoleDailyCounts(
      services,
      guild.id,
      role.id,
    );
    const card = buildRoleStatsCard({
      guildName: guild.name,
      userId: interaction.user.id,
      page: 0,
      roleId: role.id,
      roleName: role.name,
      entries,
    });
    await interaction.reply(ephemeralCard(card));
    return;
  }

  const counts = await getTodayCounts(services, guild.id);
  if (counts.size === 0) {
    const body = ["No role mentions have been recorded today."];
    if (!config.analyticsEnabled) {
      body.push("Analytics is currently disabled in the module config.");
    }
    await interaction.reply(
      ephemeralCard(makeInfoCard("📊 Role Mentions Today", body)),
    );
    return;
  }

  const entries = [...counts.entries()]
    .map(([roleId, count]) => ({
      roleId,
      roleName: guild.roles.cache.get(roleId)?.name ?? null,
      count,
    }))
    .sort(
      (a, b) =>
        b.count - a.count || a.roleId.localeCompare(b.roleId),
    );
  const totalMentions = entries.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  const card = buildTopStatsCard({
    guildName: guild.name,
    userId: interaction.user.id,
    page: 0,
    entries,
    totalMentions,
  });
  await interaction.reply(ephemeralCard(card));
}

async function protectRole(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
  config: RoleMentionsConfig,
): Promise<void> {
  const role = interaction.options.getRole("role", true);
  if (role.id === guild.id) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Role Not Supported",
          "The @everyone role cannot be protected.",
        ),
      ),
    );
    return;
  }
  if (config.protectedRoleIds.includes(role.id)) {
    await interaction.reply(
      ephemeralCard(
        makeInfoCard(
          "Already Protected",
          `${roleText(role.id, role.name)} is already in the protected list.`,
        ),
      ),
    );
    return;
  }

  const check = await resolveManageableRole(guild, role.id);
  if (!check.ok) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Cannot Protect Role", check.reason)),
    );
    return;
  }

  const next: RoleMentionsConfig = {
    ...config,
    protectedRoleIds: [...config.protectedRoleIds, role.id],
  };
  if (!(await saveConfig(services, guild.id, next))) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Save Failed",
          "The protected role list could not be saved.",
        ),
      ),
    );
    return;
  }

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard("Role Protected", [
        `${roleText(role.id, check.role.name)} will be made non-mentionable for **${formatDuration(config.autoBlockMinutes)}** when mentioned.`,
        "Use `/rolementions unprotect` to stop automatic protection.",
      ]),
    ),
  );
}

async function unprotectRole(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
  config: RoleMentionsConfig,
): Promise<void> {
  const role = interaction.options.getRole("role", true);
  if (!config.protectedRoleIds.includes(role.id)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Not Protected",
          `${roleText(role.id, role.name)} is not in the protected list.`,
        ),
      ),
    );
    return;
  }

  const next: RoleMentionsConfig = {
    ...config,
    protectedRoleIds: config.protectedRoleIds.filter(
      (roleId) => roleId !== role.id,
    ),
  };
  if (!(await saveConfig(services, guild.id, next))) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Save Failed",
          "The protected role list could not be saved.",
        ),
      ),
    );
    return;
  }

  const body = [
    `${roleText(role.id, role.name)} is no longer protected.`,
  ];
  const active = await getBlock(services, guild.id, role.id);
  if (active && active.expiresAt > Date.now()) {
    body.push(
      `An active block remains until ${formatTimestamp(new Date(active.expiresAt), "R")} or until you run \`/rolementions unblock\`.`,
    );
  }

  await interaction.reply(
    ephemeralCard(makeSuccessCard("Role Unprotected", body)),
  );
}

async function blockRole(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
  config: RoleMentionsConfig,
): Promise<void> {
  const role = interaction.options.getRole("role", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const result = await applyBlock(
    services,
    guild,
    role.id,
    minutes,
    true,
    config.logChannelId,
  );

  if (!result.ok) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Block Failed", result.reason)),
    );
    return;
  }

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard("Role Blocked", [
        `${roleText(result.block.roleId, result.block.roleName)} is now non-mentionable.`,
        `It will be restored ${formatTimestamp(new Date(result.block.expiresAt), "R")}.`,
      ]),
    ),
  );
}

async function unblockRole(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
  config: RoleMentionsConfig,
): Promise<void> {
  const role = interaction.options.getRole("role", true);
  const block = await getBlock(services, guild.id, role.id);
  if (!block) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Not Blocked",
          `${roleText(role.id, role.name)} is not currently blocked.`,
        ),
      ),
    );
    return;
  }

  const outcome = await restoreBlock(
    services,
    guild,
    block,
    "manual",
    config.logChannelId,
  );
  if (!outcome.ok) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Unblock Failed",
          outcome.reason ?? "The role could not be restored.",
        ),
      ),
    );
    return;
  }

  if (outcome.roleMissing) {
    await interaction.reply(
      ephemeralCard(
        makeWarningCard(
          "Block Cleared",
          `${roleText(role.id, block.roleName)} no longer exists, so its block record was removed.`,
        ),
      ),
    );
    return;
  }

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(
        "Role Unblocked",
        `${roleText(role.id, role.name)} is ${block.previousMentionable ? "mentionable" : "not mentionable"} again.`,
      ),
    ),
  );
}

export const rolementionsCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("rolementions")
    .setDescription("Role mention analytics and timed mention protection.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stats")
        .setDescription(
          "Show today's top mentioned roles or one role's daily counts.",
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to inspect")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("top")
        .setDescription("Show the most mentioned roles today.")
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of roles to show (1-25)")
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List protected roles and active blocks."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription("Reset today's role mention counters."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("protect")
        .setDescription("Add a role to the protected list.")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to protect")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unprotect")
        .setDescription("Remove a role from the protected list.")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to unprotect")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("block")
        .setDescription("Temporarily disable mentions of a role.")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to block")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("minutes")
            .setDescription("Block duration in minutes")
            .setMinValue(1)
            .setMaxValue(43200)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unblock")
        .setDescription("Restore mentions of a blocked role.")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to unblock")
            .setRequired(true),
        ),
    ),
  requiredPermit: "mod.rolementions",
  guildOnly: true,
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Server Only",
            "This command only works inside a server.",
          ),
        ),
      );
      return;
    }
    if (!services.modules.isEnabled(guild.id, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "Role Mentions is disabled on this server.",
          ),
        ),
      );
      return;
    }

    const config = await readConfig(services, guild.id);
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === "stats") {
      await showStats(interaction, services, guild, config);
      return;
    }
    if (subcommand === "top") {
      await showTop(interaction, services, guild, config);
      return;
    }
    if (!(await requireAdmin(interaction, services, guild))) return;
    if (subcommand === "list") {
      await listProtection(interaction, services, guild, config);
      return;
    }
    if (subcommand === "reset") {
      await resetCounters(interaction, services, guild);
      return;
    }
    if (subcommand === "protect") {
      await protectRole(interaction, services, guild, config);
      return;
    }
    if (subcommand === "unprotect") {
      await unprotectRole(interaction, services, guild, config);
      return;
    }
    if (subcommand === "block") {
      await blockRole(interaction, services, guild, config);
      return;
    }
    if (subcommand === "unblock") {
      await unblockRole(interaction, services, guild, config);
      return;
    }

    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Unknown Subcommand",
          "That subcommand is not supported.",
        ),
      ),
    );
  },
};