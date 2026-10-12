import type { Container } from "@lumi-devs/lumi/services";
import { scheduleOneshot } from "@lumi-devs/lumi/scheduler";
import { makeSuccessCard, makeWarningCard } from "@lumi-devs/lumi/ui";
import { EXPIRE_ONESHOT, MODULE_NAME, type ActiveBlock } from "./Keys.js";
import { getBlock, removeBlock, setBlock } from "./Store.js";
import { sendLog } from "./Log.js";
import {
  formatMinutes,
  formatRemaining,
  roleLabel,
  roleMention,
} from "./Format.js";

export async function applyBlock(
  services: Container,
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

  await setBlock(services, guildId, block);
  await scheduleOneshot(
    services,
    MODULE_NAME,
    EXPIRE_ONESHOT,
    guildId,
    durationMinutes * 60_000,
    { roleId },
  ).catch((err: unknown) =>
    services.logger.error(
      `[rolementions] Failed to schedule expiry for ${guildId}/${roleId}: ${String(err)}`,
    ),
  );

  await sendLog(
    services,
    guildId,
    makeWarningCard(
      "🛡️ Role Protection Activated",
      [
        `Mentions of ${roleMention(roleId)} are now blocked.`,
        [
          `**Duration:** ${formatMinutes(durationMinutes)}`,
          `**Expires:** <t:${Math.floor(block.expiresAt / 1000)}:R>`,
          `**Trigger:** ${manual ? "Manual" : "Mention spam"}`,
        ].join("\n"),
      ],
      { footer: "Protection auto-removes when it expires." },
    ),
  );

  return block;
}

export async function liftBlock(
  services: Container,
  guildId: string,
  roleId: string,
  reason: "expired" | "manual",
): Promise<ActiveBlock | null> {
  const block = await getBlock(services, guildId, roleId);
  if (!block) return null;

  await removeBlock(services, guildId, roleId);

  const title =
    reason === "expired"
      ? "🔓 Role Protection Expired"
      : "🔓 Role Protection Removed";

  await sendLog(
    services,
    guildId,
    makeSuccessCard(title, [
      `Mentions of ${roleLabel(roleId, block.roleName)} are allowed again.`,
      reason === "manual"
        ? `**Removed early** - ${formatRemaining(block.expiresAt)} was remaining.`
        : `**Was protected for** ${formatMinutes(block.durationMinutes)}.`,
    ]),
  );

  return block;
}
