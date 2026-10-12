import type { Container } from "#src/lib/Services.js";
import type { OneshotContext } from "#src/lib/scheduler/Oneshot.js";
import { liftBlock } from "../utilities/Protection.js";

export async function handleExpire(
  services: Container,
  ctx: OneshotContext,
): Promise<void> {
  const data = ctx.data as { roleId?: string } | null;
  const roleId = data?.roleId;
  if (typeof roleId !== "string") return;
  await liftBlock(services, ctx.guildId, roleId, "expired");
}
