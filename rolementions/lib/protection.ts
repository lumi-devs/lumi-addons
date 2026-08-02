import { container } from "@sapphire/framework";
import type { Guild, Role } from "discord.js";
import { makeWarningCard, makeSuccessCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { relativeTimestamp } from "#utilities/time.js";
import { getBlock, removeBlock, setBlock, type ActiveBlock } from "./store.js";
import { syncRule } from "./automod.js";
import { sendLog } from "./log.js";
import { formatMinutes, formatRemaining, roleLabel } from "./format.js";

const expiryJobId = (guildId: string, roleId: string) =>
  `rm-expire:${guildId}:${roleId}`;

async function scheduleExpiry(
  guildId: string,
  roleId: string,
  delayMs: number,
): Promise<void> {
  await container.tasks
    .create(
      { name: "rolementions-expire", payload: { guildId, roleId } },
      {
        repeated: false,
        delay: Math.max(delayMs, 0),
        customJobOptions: {
          jobId: expiryJobId(guildId, roleId),
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    )
    .catch((err: unknown) =>
      container.logger.error(
        `[rolementions] Failed to schedule expiry for ${guildId}/${roleId}:`,
        err,
      ),
    );
}

/** Add a role to the active block list, sync AutoMod, schedule expiry, and log. */
export async function applyBlock(
  guild: Guild,
  role: Role,
  durationMinutes: number,
  manual: boolean,
): Promise<ActiveBlock> {
  const now = Date.now();
  const block: ActiveBlock = {
    roleId: role.id,
    roleName: role.name,
    createdAt: now,
    expiresAt: now + durationMinutes * 60_000,
    durationMinutes,
    manual,
  };

  await setBlock(guild.id, block);
  await syncRule(guild);
  await scheduleExpiry(guild.id, role.id, durationMinutes * 60_000);

  await sendLog(
    guild.id,
    makeWarningCard(
      `${Emojis.SHIELD} Role Protection Activated`,
      [
        `Mentions of ${roleLabel(guild, role.id)} are now blocked.`,
        [
          `**Duration:** ${formatMinutes(durationMinutes)}`,
          `**Expires:** ${relativeTimestamp(block.expiresAt)}`,
          `**Trigger:** ${manual ? "Manual" : "Mention spam"}`,
        ].join("\n"),
      ],
      { footer: "Protection auto-removes when it expires." },
    ),
  );

  return block;
}

/**
 * Remove an active block (on expiry or manual unblock), sync AutoMod, and log.
 * Returns the block that was removed, or null if none was active.
 */
export async function liftBlock(
  guild: Guild,
  roleId: string,
  reason: "expired" | "manual",
): Promise<ActiveBlock | null> {
  const block = await getBlock(guild.id, roleId);
  if (!block) return null;

  await removeBlock(guild.id, roleId);
  await syncRule(guild);

  const title =
    reason === "expired"
      ? `${Emojis.UNLOCK} Role Protection Expired`
      : `${Emojis.UNLOCK} Role Protection Removed`;

  await sendLog(
    guild.id,
    makeSuccessCard(title, [
      `Mentions of ${roleLabel(guild, roleId, block.roleName)} are allowed again.`,
      reason === "manual"
        ? `**Removed early** — ${formatRemaining(block.expiresAt)} was remaining.`
        : `**Was protected for** ${formatMinutes(block.durationMinutes)}.`,
    ]),
  );

  return block;
}
