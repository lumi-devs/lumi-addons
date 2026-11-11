import type {
  CommandDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import {
  ephemeralCard,
  makeEmptyCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "@lumi/ui";
import {
  type ChatInputCommandInteraction,
  type Guild,
  SlashCommandBuilder,
} from "discord.js";
import {
  deleteRule,
  getGranted,
  listRules,
  ModuleName,
  upsertRule,
} from "../data.js";
import {
  activitiesFromPresence,
  ActivityTypeNames,
  activityTypeName,
  matchingRules,
  matchRuleRoles,
  normalizeActivityType,
  type ActivitySnapshot,
} from "../logic.js";
import { roleAvailability } from "../runtime.js";
import { formatRule, rulesPageCard } from "../ui.js";

const ActivityTypeChoices = ActivityTypeNames.map((name) => ({
  name,
  value: name,
}));

function roleMentions(roleIds: readonly string[]): string {
  return roleIds.length > 0
    ? roleIds.map((roleId) => `<@&${roleId}>`).join(" ")
    : "None";
}

function describePresence(
  hasPresence: boolean,
  activities: readonly ActivitySnapshot[],
): string {
  if (!hasPresence) {
    return "Not cached. The member may be offline, or the Presence intent is disabled.";
  }
  if (activities.length === 0) return "Online with no active activities.";
  return activities
    .map((activity) => {
      const type = activityTypeName(activity.type);
      const label = type ? `**${type}**` : "**Unknown**";
      const state = activity.state?.trim();
      return `• ${label} · \`${activity.name}\`${state ? ` · ${state}` : ""}`;
    })
    .join("\n");
}

async function addRule(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const type = normalizeActivityType(
    interaction.options.getString("type", true),
  );
  if (!type) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Activity Type",
          `Valid types: ${ActivityTypeNames.join(", ")}.`,
        ),
      ),
    );
    return;
  }
  const match = interaction.options.getString("match", true).trim();
  if (match.length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Invalid Match", "The match text cannot be empty."),
      ),
    );
    return;
  }
  const role = interaction.options.getRole("role", true);
  const availability = roleAvailability(guild, role.id);
  if (!availability.ok) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Cannot Assign Role", availability.reason)),
    );
    return;
  }
  await upsertRule(services, guild.id, {
    type,
    match,
    roleId: role.id,
  });
  await interaction.reply(
    ephemeralCard(
      makeSuccessCard("Activity Role Saved", [
        `**Activity type**\n${type}`,
        `**Match**\n\`${match}\``,
        `**Role**\n<@&${role.id}>`,
        "",
        "Members receive the role while a matching activity is present, and it is removed when no rule matches anymore.",
      ]),
    ),
  );
}

async function removeRule(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const type = normalizeActivityType(
    interaction.options.getString("type", true),
  );
  if (!type) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Activity Type",
          `Valid types: ${ActivityTypeNames.join(", ")}.`,
        ),
      ),
    );
    return;
  }
  const match = interaction.options.getString("match", true).trim();
  if (match.length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Invalid Match", "The match text cannot be empty."),
      ),
    );
    return;
  }
  const removed = await deleteRule(services, guild.id, type, match);
  if (!removed) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Rule Not Found",
          `No **${type}** rule matches \`${match}\`.`,
        ),
      ),
    );
    return;
  }
  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(
        "Activity Role Removed",
        `Deleted the **${type}** rule for \`${match}\`. Granted roles are cleaned up on the next presence update or sweep.`,
      ),
    ),
  );
}

async function listRoleRules(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const rules = await listRules(services, guild.id);
  if (rules.length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeEmptyCard(
          "Activity Roles",
          "No activity role rules are configured.",
          "Use `/activityroles add <type> <match> <role>` to create one.",
        ),
      ),
    );
    return;
  }
  await interaction.reply(
    ephemeralCard(rulesPageCard(rules, 1, interaction.user.id)),
  );
}

async function checkMember(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const target = interaction.options.getUser("member") ?? interaction.user;
  const member = await guild.members
    .fetch({ user: target.id, withPresences: true })
    .catch(() => null);
  if (!member) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Member Not Found",
          "That user is not a member of this server.",
        ),
      ),
    );
    return;
  }
  const presence = member.presence;
  const activities = presence ? activitiesFromPresence(presence) : [];
  const [rules, granted] = await Promise.all([
    listRules(services, guild.id),
    getGranted(services, guild.id, member.id),
  ]);
  const matched = matchingRules(activities, rules);
  const desired = matchRuleRoles(activities, rules);
  const matchedLines = matched.slice(0, 15).map((rule) => formatRule(rule));
  if (matched.length > matchedLines.length) {
    matchedLines.push(
      `-# ...and ${matched.length - matchedLines.length} more`,
    );
  }
  await interaction.reply(
    ephemeralCard(
      makeInfoCard(`🔎 Activity Check — ${member.user.username}`, [
        `**Member**\n<@${member.id}>`,
        `**Presence**\n${describePresence(presence !== null, activities)}`,
        `**Matched rules**\n${matchedLines.length > 0 ? matchedLines.join("\n") : "None"}`,
        `**Roles matching now**\n${roleMentions(desired)}`,
        `**Granted by this module**\n${roleMentions(granted)}`,
      ]),
    ),
  );
}

export const activityRolesCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("activityroles")
    .setDescription("Configure activity-based role automation")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Create or update an activity role rule")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Activity type")
            .setRequired(true)
            .addChoices(...ActivityTypeChoices),
        )
        .addStringOption((option) =>
          option
            .setName("match")
            .setDescription("Case-insensitive text to match in the activity")
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(100),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to assign")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete an activity role rule")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Activity type")
            .setRequired(true)
            .addChoices(...ActivityTypeChoices),
        )
        .addStringOption((option) =>
          option
            .setName("match")
            .setDescription("Match text of the rule to delete")
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(100),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List activity role rules"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("check")
        .setDescription("Show matched rules and granted roles for a member")
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to check (defaults to you)")
            .setRequired(false),
        ),
    ),
  requiredPermit: "mod.*",
  guildOnly: true,
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Activity Roles runs per server."),
        ),
      );
      return;
    }
    if (!services.modules.isEnabled(guild.id, ModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Module Disabled",
            "Activity Roles is disabled in this server.",
          ),
        ),
      );
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "add") {
      await addRule(interaction, services, guild);
      return;
    }
    if (subcommand === "remove") {
      await removeRule(interaction, services, guild);
      return;
    }
    if (subcommand === "check") {
      await checkMember(interaction, services, guild);
      return;
    }
    await listRoleRules(interaction, services, guild);
  },
};
