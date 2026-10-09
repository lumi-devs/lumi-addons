import { logger } from "lumi";
import { schedule } from "lumi/scheduling";
import { Emojis, makeSuccessCard, makeWarningCard } from "lumi/ui";
import { relativeTimestamp } from "lumi/utils";
import { EXPIRE_TASK } from "./keys.js";
import { getBlock, removeBlock, setBlock, type ActiveBlock } from "./store.js";
import { sendLog } from "./log.js";
import { formatMinutes, formatRemaining, roleLabel, roleMention } from "./format.js";

export async function applyBlock(
  guildId: string,
  roleId: string,
  durationMinutes: number,
  manual: boolean,
  roleName?: string,
): Promise<ActiveBlock> {
  const now = Date.now();
  const block: ActiveBlock = {
    roleId,
    roleName,
    createdAt: now,
    expiresAt: now + durationMinutes * 60_000,
    durationMinutes,
    manual,
  };

  await setBlock(guildId, block);
  await schedule(
    EXPIRE_TASK,
    { guildId, roleId },
    { delay: durationMinutes * 60_000 },
  ).catch((err: unknown) =>
    logger.error(
      `[rolementions] Failed to schedule expiry for ${guildId}/${roleId}: ${String(err)}`,
    ),
  );

  await sendLog(
    guildId,
    makeWarningCard(`${Emojis.Shield} Role Protection Activated`, [
      `Mentions of ${roleMention(roleId)} are now blocked.`,
      [
        `**Duration:** ${formatMinutes(durationMinutes)}`,
        `**Expires:** ${relativeTimestamp(block.expiresAt)}`,
        `**Trigger:** ${manual ? "Manual" : "Mention spam"}`,
      ].join("\n"),
    ], { footer: "Protection auto-removes when it expires." }),
  );

  return block;
}

export async function liftBlock(
  guildId: string,
  roleId: string,
  reason: "expired" | "manual",
): Promise<ActiveBlock | null> {
  const block = await getBlock(guildId, roleId);
  if (!block) return null;

  await removeBlock(guildId, roleId);

  const title =
    reason === "expired"
      ? `${Emojis.Unlock} Role Protection Expired`
      : `${Emojis.Unlock} Role Protection Removed`;

  await sendLog(
    guildId,
    makeSuccessCard(title, [
      `Mentions of ${roleLabel(roleId, block.roleName)} are allowed again.`,
      reason === "manual"
        ? `**Removed early** — ${formatRemaining(block.expiresAt)} was remaining.`
        : `**Was protected for** ${formatMinutes(block.durationMinutes)}.`,
    ]),
  );

  return block;
}

export async function handleRoleBlockExpire(
  guildId: string,
  roleId: string,
): Promise<void> {
  await liftBlock(guildId, roleId, "expired");
}
