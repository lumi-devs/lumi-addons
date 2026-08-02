// Worker-side handler for the admin "sweep all prior threads" job. Broadcast, so
// each worker checks its own guilds.cache and only the holder acts. Walks every
// active + archived thread in scope, deletes empty / small ones, optionally
// strips members from the survivors, then posts a summary card.

import { container } from "@sapphire/framework";
import { ChannelType, type Guild, type ThreadChannel } from "discord.js";
import { userMention } from "@discordjs/formatters";
import { getService } from "#core/module-system/Service.js";
import { isModuleEnabled } from "#utilities/listeners.js";
import { makeSuccessCard, noPingCard } from "#utilities/cards.js";
import type { ThreadSweepPayload } from "../scheduled-tasks/threadSweep.js";
import { sweepVerdict, emptyTotals, type SweepTotals } from "./sweep.js";

// Channel types that own a thread manager we can enumerate archived threads on.
const THREAD_PARENTS = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

// Safety cap so a runaway guild can't spin forever.
const MAX_THREADS = 5_000;

export async function handleThreadSweepFire(
  payload: ThreadSweepPayload,
): Promise<void> {
  const { guildId } = payload;
  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) return;
  if (!(await isModuleEnabled(guildId, "thread-cleaner"))) return;

  const parentIds =
    payload.scope === "enabled"
      ? new Set(
          await getService("config").getConfigList(
            guildId,
            "thread-cleaner",
            "enabled_channels",
          ),
        )
      : null; // null = all channels

  const threads = await collectThreads(guild, parentIds);
  const totals = emptyTotals();

  for (const thread of threads) {
    if (totals.scanned >= MAX_THREADS) break;
    totals.scanned += 1;
    try {
      const count = thread.messageCount ?? 0;
      if (sweepVerdict(count, payload.minMessages) === "delete") {
        await thread.delete(
          `Thread sweep by ${payload.requesterId}: ≤ ${payload.minMessages} messages`,
        );
        totals.deleted += 1;
      } else {
        totals.kept += 1;
        if (payload.stripMembers && (await stripMembers(thread)))
          totals.stripped += 1;
      }
    } catch (err) {
      totals.failed += 1;
      container.logger.debug(
        `[ThreadCleaner] sweep failed for thread ${thread.id}:`,
        err,
      );
    }
  }

  await report(guild, payload, totals);
}

/** Gather active + archived threads in scope (bounded, best-effort). */
async function collectThreads(
  guild: Guild,
  parentIds: Set<string> | null,
): Promise<ThreadChannel[]> {
  const out: ThreadChannel[] = [];
  const inScope = (parentId: string | null) =>
    parentId !== null && (parentIds === null || parentIds.has(parentId));

  // Active threads — one call for the whole guild.
  const active = await guild.channels.fetchActiveThreads().catch(() => null);
  if (active)
    for (const thread of active.threads.values())
      if (inScope(thread.parentId)) out.push(thread);

  // Archived threads — per thread-capable parent, paginated by `before`.
  for (const channel of guild.channels.cache.values()) {
    if (!THREAD_PARENTS.has(channel.type)) continue;
    if (parentIds !== null && !parentIds.has(channel.id)) continue;
    const manager = (channel as { threads?: unknown }).threads;
    if (
      !manager ||
      typeof (manager as { fetchArchived?: unknown }).fetchArchived !==
        "function"
    )
      continue;

    let before: string | undefined;
    for (let page = 0; page < 20; page++) {
      const fetched = await (
        manager as {
          fetchArchived: (o: { limit: number; before?: string }) => Promise<{
            threads: Map<string, ThreadChannel>;
            hasMore: boolean;
          }>;
        }
      )
        .fetchArchived({ limit: 100, before })
        .catch(() => null);
      if (!fetched || fetched.threads.size === 0) break;
      let last: ThreadChannel | undefined;
      for (const thread of fetched.threads.values()) {
        out.push(thread);
        last = thread;
      }
      if (!fetched.hasMore || !last) break;
      before = last.id;
    }
  }
  return out;
}

/** Remove every added member from a (non-archived) thread except the bot. */
async function stripMembers(thread: ThreadChannel): Promise<boolean> {
  if (thread.archived) return false; // can't modify members of archived threads
  const members = await thread.members.fetch().catch(() => null);
  if (!members) return false;
  const selfId = container.client.user?.id;
  let removed = 0;
  for (const member of members.values()) {
    if (member.id === selfId || member.id === thread.ownerId) continue;
    if (
      await thread.members.remove(member.id).then(
        () => true,
        () => false,
      )
    )
      removed += 1;
  }
  return removed > 0;
}

async function report(
  guild: Guild,
  payload: ThreadSweepPayload,
  totals: SweepTotals,
): Promise<void> {
  const channel =
    guild.channels.cache.get(payload.channelId) ??
    (await guild.channels.fetch(payload.channelId).catch(() => null));
  if (!channel || !channel.isSendable()) return;
  const lines = [
    `${userMention(payload.requesterId)}'s thread sweep finished.`,
    "",
    `**Scanned:** ${totals.scanned}`,
    `**Deleted:** ${totals.deleted} (≤ ${payload.minMessages} messages)`,
    `**Kept:** ${totals.kept}`,
    payload.stripMembers ? `**Members stripped from:** ${totals.stripped}` : "",
    totals.failed ? `**Failed:** ${totals.failed}` : "",
  ].filter(Boolean);
  await channel
    .send(noPingCard(makeSuccessCard("🧹 Thread Sweep Complete", lines)))
    .catch(() => null);
}
