import type { CommandDefinition, ModuleServices } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "@lumi/ui";
import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import {
  ActivityKinds,
  getEntries,
  getState,
  MaxEntries,
  MaxIntervalSeconds,
  MinIntervalSeconds,
  ModuleName,
  nextEntryId,
  PresenceStates,
  saveEntries,
  saveState,
  type StatusEntry,
} from "../data.js";
import {
  formatDurationSeconds,
  parseActivityKind,
  parseDurationSeconds,
  parsePresenceState,
  sanitizeStatusText,
} from "../logic.js";
import { applyNext } from "../tasks/rotate.js";
import { listCard } from "../ui.js";

const TypeChoices = ActivityKinds.map((kind) => ({
  name: kind,
  value: kind,
}));
const PresenceChoices = PresenceStates.map((presence) => ({
  name: presence,
  value: presence,
}));

function errorCard(title: string, body: string) {
  return ephemeralCard(makeErrorCard(title, body));
}

async function handleAdd(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const text = sanitizeStatusText(interaction.options.getString("text", true));
  if (!text) {
    await interaction.reply(
      errorCard(
        "Missing Text",
        "Provide status text containing at least one visible character.",
      ),
    );
    return;
  }

  const type = parseActivityKind(interaction.options.getString("type"));
  if (!type) {
    await interaction.reply(
      errorCard("Invalid Type", `Choose one of: ${ActivityKinds.join(", ")}.`),
    );
    return;
  }

  const presence = parsePresenceState(
    interaction.options.getString("presence"),
  );
  if (!presence) {
    await interaction.reply(
      errorCard(
        "Invalid Presence",
        `Choose one of: ${PresenceStates.join(", ")}.`,
      ),
    );
    return;
  }

  const entries = await getEntries(services, guildId);
  if (entries.length >= MaxEntries) {
    await interaction.reply(
      errorCard(
        "Limit Reached",
        `This server already has the maximum of ${MaxEntries} statuses. Remove one first.`,
      ),
    );
    return;
  }

  const entry: StatusEntry = {
    id: nextEntryId(entries),
    text,
    type,
    presence,
  };
  await saveEntries(services, guildId, [...entries, entry]);

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard("Status Added", [
        `**#${entry.id}** · ${entry.type} · ${entry.presence}`,
        entry.text,
        "Placeholders `{guilds}` and `{users}` resolve when the status is applied.",
      ]),
    ),
  );
}

async function handleRemove(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  const entries = await getEntries(services, guildId);
  const remaining = entries.filter((entry) => entry.id !== id);
  if (remaining.length === entries.length) {
    await interaction.reply(
      errorCard(
        "Not Found",
        `No status with id **#${id}**. Check \`/status list\`.`,
      ),
    );
    return;
  }

  await saveEntries(services, guildId, remaining);
  await interaction.reply(
    ephemeralCard(
      makeSuccessCard("Status Removed", `Entry **#${id}** was deleted.`),
    ),
  );
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const [entries, state] = await Promise.all([
    getEntries(services, guildId),
    getState(services, guildId),
  ]);
  await interaction.reply(
    ephemeralCard(
      listCard({
        entries,
        state,
        page: 0,
        userId: interaction.user.id,
      }),
    ),
  );
}

async function handleInterval(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const seconds = parseDurationSeconds(
    interaction.options.getString("duration", true),
  );
  if (
    seconds === null ||
    seconds < MinIntervalSeconds ||
    seconds > MaxIntervalSeconds
  ) {
    await interaction.reply(
      errorCard(
        "Invalid Duration",
        "Use a duration between 30 seconds and 24 hours, e.g. `30s`, `5m`, or `1h`.",
      ),
    );
    return;
  }

  const state = await getState(services, guildId);
  const now = Date.now();
  await saveState(services, guildId, {
    ...state,
    intervalSeconds: seconds,
    nextAt: now + seconds * 1_000,
    activatedAt: state.enabled ? now : state.activatedAt,
  });

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(
        "Interval Updated",
        `Statuses now rotate every **${formatDurationSeconds(seconds)}**.`,
      ),
    ),
  );
}

async function handleToggle(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const state = await getState(services, guildId);
  const enabled = !state.enabled;
  const now = Date.now();
  await saveState(services, guildId, {
    ...state,
    enabled,
    activatedAt: enabled ? now : state.activatedAt,
    nextAt: enabled ? now : state.nextAt,
  });

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(
        enabled ? "Rotation Enabled" : "Rotation Disabled",
        enabled
          ? "The next status is due immediately and applies within a minute."
          : "The current presence stays as-is until rotation is enabled again.",
      ),
    ),
  );
}

async function handlePreview(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guildId: string,
): Promise<void> {
  const [entries, state] = await Promise.all([
    getEntries(services, guildId),
    getState(services, guildId),
  ]);
  if (entries.length === 0) {
    await interaction.reply(
      errorCard(
        "Nothing to Preview",
        "Add a status with `/status add` before previewing.",
      ),
    );
    return;
  }

  const now = Date.now();
  const base = state.enabled ? { ...state, activatedAt: now } : state;
  const applied = await applyNext(services, guildId, base, entries, now);
  if (!applied) {
    await interaction.reply(
      errorCard("Nothing to Preview", "The next status could not be applied."),
    );
    return;
  }

  const body = [
    `**#${applied.id}** · ${applied.type} · ${applied.presence}`,
    applied.text,
  ];
  if (state.enabled) {
    body.push(
      `Next apply in ${formatDurationSeconds(state.intervalSeconds)}.`,
    );
    await interaction.reply(
      ephemeralCard(makeSuccessCard("Status Applied", body)),
    );
    return;
  }

  body.push("Rotation is disabled, so this preview will not repeat.");
  await interaction.reply(
    ephemeralCard(makeWarningCard("Preview Applied", body)),
  );
}

export const statusCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Manage the bot's rotating presence.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a rotating status")
        .addStringOption((option) =>
          option
            .setName("text")
            .setDescription("Status text; supports {guilds} and {users}")
            .setMaxLength(128)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Activity type (default Playing)")
            .addChoices(...TypeChoices)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("presence")
            .setDescription("Online status (default online)")
            .addChoices(...PresenceChoices)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a status by id")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("Entry id from /status list")
            .setMinValue(1)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List rotating statuses"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("interval")
        .setDescription("Set the rotation interval")
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("Between 30s and 24h, e.g. 30s, 5m, 1h")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("toggle")
        .setDescription("Enable or disable rotation"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("preview")
        .setDescription("Apply the next status immediately"),
    ),
  guildOnly: true,
  ownerOnly: true,
  async execute(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId) return;

    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(
        errorCard("Module Disabled", "The status module is disabled here."),
      );
      return;
    }

    switch (interaction.options.getSubcommand(true)) {
      case "add":
        await handleAdd(interaction, services, guildId);
        return;
      case "remove":
        await handleRemove(interaction, services, guildId);
        return;
      case "list":
        await handleList(interaction, services, guildId);
        return;
      case "interval":
        await handleInterval(interaction, services, guildId);
        return;
      case "toggle":
        await handleToggle(interaction, services, guildId);
        return;
      case "preview":
        await handlePreview(interaction, services, guildId);
        return;
    }
  },
};