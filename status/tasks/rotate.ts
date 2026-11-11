import type { ModuleServices, TaskDefinition } from "@lumi/module-kit";
import {
  type ActivitiesOptions,
  ActivityType,
  type Client,
} from "discord.js";
import {
  type ActivityKind,
  getEntries,
  ModuleName,
  type RotationState,
  saveState,
  StateKey,
  type StatusEntry,
  TargetId,
} from "../data.js";
import { pickController, resolvePlaceholders } from "../logic.js";

const ActivityTypes: Record<ActivityKind, ActivityType> = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
  Custom: ActivityType.Custom,
  Streaming: ActivityType.Streaming,
};

function buildActivity(entry: StatusEntry, text: string): ActivitiesOptions {
  const activity: ActivitiesOptions = {
    name: text,
    type: ActivityTypes[entry.type],
  };
  if (entry.type === "Streaming" && /^https?:\/\/\S+$/i.test(text)) {
    activity.url = text;
  }
  return activity;
}

function applyPresence(client: Client, entry: StatusEntry): void {
  const guilds = client.guilds.cache.size;
  const users = client.guilds.cache.reduce(
    (total, guild) => total + guild.memberCount,
    0,
  );
  const text = resolvePlaceholders(entry.text, { guilds, users });
  client.user?.setPresence({
    status: entry.presence,
    activities: [buildActivity(entry, text)],
  });
}

export async function applyNext(
  services: ModuleServices,
  guildId: string,
  state: RotationState,
  entries: readonly StatusEntry[],
  now: number = Date.now(),
): Promise<StatusEntry | null> {
  const total = entries.length;
  if (total === 0) return null;

  const index = ((Math.trunc(state.cursor) % total) + total) % total;
  const entry = entries[index];
  if (!entry) return null;

  applyPresence(services.client, entry);

  await saveState(services, guildId, {
    ...state,
    cursor: (index + 1) % total,
    lastEntryId: entry.id,
    nextAt: now + state.intervalSeconds * 1_000,
  });
  return entry;
}

export const rotateTask: TaskDefinition = {
  name: "rotate",
  cron: "* * * * *",
  timezone: "UTC",
  async handler(services) {
    try {
      const rows = await services.helpers.moduleData.list<RotationState>({
        moduleName: ModuleName,
        targetId: TargetId,
        key: StateKey,
      });
      const controller = pickController(rows);
      if (!controller) return;

      const now = Date.now();
      if (now < controller.state.nextAt) return;

      const entries = await getEntries(services, controller.guildId);
      if (entries.length === 0) return;

      await applyNext(
        services,
        controller.guildId,
        controller.state,
        entries,
        now,
      );
    } catch (error) {
      services.observability.logger.warn("status rotation failed", { error });
    }
  },
};